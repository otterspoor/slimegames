import * as Base from '../base/index.js';
import * as AI from '../ai/index.js';
import { SoccerRolloutSimulator, type SoccerWorldSnapshot, type P2Action } from './SoccerRolloutSimulator.js';
import { planFromInput } from '../ai/UserIntent.js';

type MoveDir = -1 | 0 | 1;
type Mode = 'DEFEND' | 'ATTACK' | 'CONTEST';

// Soccer-specific AI:
// - If "in control": get behind the ball and strike toward opponent goal (left).
// - If not: defend own goal (right), block shots, and clear.
export class SoccerAI extends AI.AIBase {
  private input = new AI.VirtualInput();
  private rollout = new SoccerRolloutSimulator();
  private tick = 0;

  private moveDir: MoveDir = 0;
  private lastDirChangeTick = 0;

  private touchingSinceTick: number | null = null;
  private lastStrikeTick = -9999;

  // Motion smoothing to avoid jitter
  private readonly enterMoveThreshold = 22; // px
  private readonly exitMoveThreshold = 12; // px
  private readonly dirSwitchDebounceTicks = 8; // ~133ms @ 60Hz

  // "Touch" heuristics (used for striking/jumping decisions)
  private readonly touchDist = Base.CONFIG.slimeRadius + Base.CONFIG.ballRadius + 18;
  private readonly touchMaxBallHeight = 175; // px above ground
  private readonly maxTouchHoldMs = 900; // don't juggle forever
  private readonly maxTouchHoldTicks = 54; // ~900ms @ 60Hz
  private readonly strikeCooldownTicks = 33; // ~550ms @ 60Hz

  private readonly velAmbiguous = 0.35; // px/tick-ish (game units per update)
  private readonly closerMargin = 6; // px (avoid flip-flopping when equal)

  getInput(slime: Base.SlimeBase, ball: Base.BallBase, opponent: Base.SlimeBase, opponentInput: Base.InputSource): Base.InputSource {
    this.tick++;
    const tick = this.tick;

    const groundY = Base.CONFIG.internalHeight - Base.CONFIG.groundHeight;
    const ballHeightAboveGround = groundY - ball.y;

    const selfDist = Math.hypot(ball.x - slime.x, ball.y - slime.y);
    const oppDist = Math.hypot(ball.x - opponent.x, ball.y - opponent.y);

    // New "control" rule:
    // - If ball moving left AND AI closer than player => AI is "in control" (attack)
    // - If ball moving right AND player closer than AI => defend
    // - Otherwise => ambiguous => contest (try to gain control)
    const ballMovingLeft = ball.vx < -this.velAmbiguous;
    const ballMovingRight = ball.vx > this.velAmbiguous;
    const aiCloser = (selfDist + this.closerMargin) < oppDist;
    const playerCloser = (oppDist + this.closerMargin) < selfDist;

    // New higher-level intent:
    // - Chase the ball no matter what (CONTEST baseline)
    // - Only DEFEND when we're already between our goal (right) and the ball (i.e. to the right of the ball),
    //   AND the ball is unambiguously dangerous (moving right) or a neutral rollout predicts we concede soon.
    const betweenOwnGoalAndBallNow = slime.x > (ball.x + 8);

    // "Likely to score" check (still input-based): if we do nothing for a short horizon,
    // do we concede? This captures weird bounces (e.g., crossbar) without any ball-oracle.
    const neutralSnapshot: SoccerWorldSnapshot = {
      p1: { x: opponent.x, y: opponent.y, vx: opponent.vx, vy: opponent.vy },
      p2: { x: slime.x, y: slime.y, vx: slime.vx, vy: slime.vy },
      ball: { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy },
    };
    const p1Plan = planFromInput(opponentInput, true);
    // Use a longer horizon when the ball is already traveling toward our goal.
    const neutralHorizon = ballMovingRight ? 140 : 45;
    const neutralOutcome = this.rollout.simulate(
      neutralSnapshot,
      neutralHorizon,
      { action: 'NONE', jumpOnStep0: false },
      { p1Plan: { action: p1Plan.action, jumpOnStep0: p1Plan.jumpOnStep0 } }
    );
    const likelyConcedeSoon = neutralOutcome.verdict === 'loss';

    let mode: Mode = 'CONTEST';
    if (ballMovingLeft && aiCloser) mode = 'ATTACK';
    else if (betweenOwnGoalAndBallNow && (ballMovingRight || likelyConcedeSoon)) mode = 'DEFEND';

    // Touch/possession (for jump/strike decisions)
    const canTouchBall = selfDist <= this.touchDist && ballHeightAboveGround <= this.touchMaxBallHeight;

    if (canTouchBall) {
      if (this.touchingSinceTick == null) this.touchingSinceTick = tick;
    } else {
      this.touchingSinceTick = null;
    }

    // --- Choose a horizontal target ---
    // P2 attacks left goal, defends right goal.
    const ownGoalX = Base.CONFIG.internalWidth;
    const opponentGoalX = 0;

    let targetX = slime.x;

    if (mode === 'DEFEND') {
      // Keep yourself between ball and your goal, but don't camp fully inside goal.
      // Also bias slightly behind the ball (toward own goal) to block shots.
      // IMPORTANT: don't run away from the ball; stay close enough to contest and clear.
      const closeBehind = ball.x + (ball.x > Base.CONFIG.internalWidth * 0.82 ? 35 : 65);
      const minX = Base.CONFIG.internalWidth * 0.52;
      const maxX = ownGoalX - Base.CONFIG.slimeRadius - 20;
      targetX = clamp(closeBehind, minX, maxX);
    } else {
      // ATTACK/CONTEST:
      // Get behind the ball (on the right side of it) so impacts push it leftward.
      // In CONTEST we still try to win the ball, so we chase slightly less "behind" to close faster.
      // If ball is moving toward our goal, don't run behind it (that tends to push it right).
      // Instead, get to the RIGHT of it so any contact tends to push it LEFT (away from our goal).
      if (ballMovingRight) {
        targetX = ball.x + 55;
      } else {
        const behindBallOffset = mode === 'ATTACK' ? 70 : 45;
        targetX = ball.x + behindBallOffset;
      }

      // Don't overrun into the left wall.
      targetX = clamp(targetX, Base.CONFIG.slimeRadius + 10, ownGoalX - Base.CONFIG.slimeRadius - 10);
    }

    // --- Decide strike/jump ---
    const timeTouchingTicks = this.touchingSinceTick == null ? 0 : (tick - this.touchingSinceTick);
    const canStrike = (tick - this.lastStrikeTick) >= this.strikeCooldownTicks;

    // Strike intent: if we've been in control too long, or if ball is in a good shooting lane.
    const shouldForceStrike = canTouchBall && timeTouchingTicks >= this.maxTouchHoldTicks && canStrike;

    // Shot opportunity: ball is near our front and not too high.
    const ballInFrontForShot = ball.x < slime.x - 10 && ballHeightAboveGround <= 140;
    const shouldTakeShot = canTouchBall && canStrike && ballInFrontForShot && mode !== 'DEFEND';

    // Defensive block: ball moving toward our goal and approaching our box.
    const ballThreateningGoal = ball.vx > 1.2 && ball.x > Base.CONFIG.internalWidth * 0.62 && ballHeightAboveGround <= 170;
    const shouldBlock = mode === 'DEFEND' && ballThreateningGoal && Math.abs(ball.x - slime.x) < 55 && canStrike;

    const doJump = (shouldForceStrike || shouldTakeShot || shouldBlock) && slime.y >= groundY;
    let willJump = doJump;

    // If we're striking, bias targetX to "step into" the ball right before the jump.
    if ((shouldForceStrike || shouldTakeShot) && canTouchBall && willJump) {
      targetX = ball.x + 40;
    }

    // Input-based rollout:
    // Try a few candidate actions (and optional jump) and pick the one that
    // does NOT concede and (ideally) scores.
    // This uses the real game physics and only varies inputs.
    const plan = this.pickPlanByRollout(slime, opponent, ball, mode, willJump, p1Plan);
    if (plan.jumpOnStep0 && slime.y >= groundY && canStrike) {
      // spend our strike "cooldown" only when we actually jump
      this.lastStrikeTick = tick;
    }

    // --- Convert to virtual keys with hysteresis + debounce ---
    const errorX = targetX - slime.x;
    const absErrorX = Math.abs(errorX);

    // stop
    if (this.moveDir !== 0 && absErrorX <= this.exitMoveThreshold) {
      this.moveDir = 0;
      this.lastDirChangeTick = tick;
    }

    // start (from idle)
    if (this.moveDir === 0 && absErrorX >= this.enterMoveThreshold) {
      this.moveDir = errorX > 0 ? 1 : -1;
      this.lastDirChangeTick = tick;
    }

    // switch direction (debounced)
    const desiredDir: MoveDir = absErrorX >= this.enterMoveThreshold ? (errorX > 0 ? 1 : -1) : 0;
    const wantsSwitch = this.moveDir !== 0 && desiredDir !== 0 && desiredDir !== this.moveDir;
    if (wantsSwitch && (tick - this.lastDirChangeTick) >= this.dirSwitchDebounceTicks) {
      this.moveDir = desiredDir as MoveDir;
      this.lastDirChangeTick = tick;
    }

    this.input.clear();

    // P2 controls
    // Use the rollout's chosen direction immediately (overrides hysteresis when needed).
    // This keeps behavior consistent with the simulated plan.
    this.input.setKey('ArrowRight', plan.action === 'RIGHT');
    this.input.setKey('ArrowLeft', plan.action === 'LEFT');
    this.input.setKey('ArrowUp', plan.jumpOnStep0 && slime.y >= groundY);

    return this.input;
  }

  private pickPlanByRollout(
    slime: Base.SlimeBase,
    opponent: Base.SlimeBase,
    ball: Base.BallBase,
    mode: Mode,
    prefersJump: boolean,
    p1Plan: ReturnType<typeof planFromInput>
  ): { action: P2Action; jumpOnStep0: boolean } {
    const snapshot: SoccerWorldSnapshot = {
      p1: { x: opponent.x, y: opponent.y, vx: opponent.vx, vy: opponent.vy },
      p2: { x: slime.x, y: slime.y, vx: slime.vx, vy: slime.vy },
      ball: { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy },
    };

    // Candidate plans: purely input-based.
    const candidates: Array<{ action: P2Action; jumpOnStep0: boolean }> = [
      { action: 'LEFT', jumpOnStep0: false },
      { action: 'RIGHT', jumpOnStep0: false },
      { action: 'NONE', jumpOnStep0: false },
    ];

    // Only add jump variants when we intend to strike/block (keeps AI from spam-jumping)
    if (prefersJump) {
      candidates.push({ action: 'LEFT', jumpOnStep0: true });
      candidates.push({ action: 'RIGHT', jumpOnStep0: true });
      candidates.push({ action: 'NONE', jumpOnStep0: true });
    }

    const ballMovingRightNow = ball.vx > this.velAmbiguous;
    const ballMovingLeftNow = ball.vx < -this.velAmbiguous;
    const ballBehindNow = snapshot.ball.x > snapshot.p2.x + 6;
    const groundY = Base.CONFIG.internalHeight - Base.CONFIG.groundHeight;
    const ballIsInAirNow = snapshot.ball.y < (groundY - 60);
    const ballIsLowNow = snapshot.ball.y > (groundY - 40);
    const ballIsLeftOfP2Now = snapshot.ball.x < snapshot.p2.x - 10;
    const overheadToOwnGoalCase = ballMovingRightNow && ballIsInAirNow && ballIsLeftOfP2Now && !ballBehindNow;

    // Rollout horizon: short & local by default, but longer when we're in danger of conceding.
    // This fixes cases where a high lob is "inevitably" going in but takes >1s to cross the line.
    const horizon = overheadToOwnGoalCase ? 170 : (ballMovingRightNow ? 130 : 60);

    // Hard input-based override for the problematic case:
    // If the ball is high, moving toward our goal, and still left of us, moving LEFT is almost always wrong.
    // We need to get under it by moving RIGHT.
    if (overheadToOwnGoalCase) {
      return { action: 'RIGHT', jumpOnStep0: false };
    }

    let best = candidates[0];
    let bestScore = -Infinity;

    for (const c of candidates) {
      const res = this.rollout.simulate(snapshot, horizon, c, {
        p1Plan: { action: p1Plan.action, jumpOnStep0: p1Plan.jumpOnStep0 }
      });

      // Hard constraints: don't concede if avoidable
      if (res.verdict === 'loss') {
        // still allow in extreme cases, but heavily penalize
        let score = -1_000_000 + (res.step ?? horizon);
        // Tie-breaker: if all options lead to a loss (e.g. ball flying over head),
        // prefer the one that keeps us closer to the ball (chasing) rather than drifting away.
        score -= Math.abs(res.end.ball.x - res.end.p2.x) * 0.1;
        
        if (score > bestScore) { bestScore = score; best = c; }
        continue;
      }

      let score = 0;
      if (res.verdict === 'win') {
        score += 100_000 - (res.step ?? horizon);
      } else {
        // No goal: prefer ball moving left and away from our goal
        score += (-res.end.ball.vx) * 200;
        score += (Base.CONFIG.internalWidth - res.end.ball.x) * 0.3; // ball more left is better
      }

      // Always value "getting to the ball" (prevents running away when it goes behind you).
      // Stronger than before so "chase no matter what" wins over minor heuristics.
      score -= Math.abs(res.end.ball.x - res.end.p2.x) * 4.0;

      // If the ball is currently behind us, heavily penalize choosing LEFT (running further away).
      if (ballBehindNow && c.action === 'LEFT') {
        score -= 1200;
      }

      // Corner case: ball is traveling RIGHT, currently LEFT of us, and high in the air.
      // Chasing left "to meet it" is a trap — it will often fly over our head and end up behind us,
      // after which we concede. Prefer moving RIGHT underneath the flight path.
      if (overheadToOwnGoalCase) {
        if (c.action === 'LEFT') score -= 1800;
        if (c.action === 'RIGHT') score += 520;
        if (c.action === 'NONE') score += 120;
      }

      // If the ball is currently moving toward our goal (right), strongly prefer ending up to the
      // RIGHT of the ball (so contacts push it LEFT and we don't own-goal).
      if (ballMovingRightNow) {
        // Reward being between ball and our goal
        score += Math.max(0, res.end.p2.x - res.end.ball.x) * 10;
        // Penalize failing to get behind
        score -= Math.max(0, res.end.ball.x - res.end.p2.x) * 22;

        // If ball is in the air: prefer moving underneath it (x-align) while staying behind
        if (ballIsInAirNow) {
          score -= Math.abs(res.end.ball.x - res.end.p2.x) * 3.0;
        }

        // If ball is low/on ground: jumping can help "hop over" to get behind
        if (ballIsLowNow && c.jumpOnStep0) {
          score += 180;
        }
      }

      // Only penalize drifting right when we're truly attacking and the ball is moving left.
      // (This avoids the "keeps moving left away from the ball" bug when it's actually behind/right.)
      if (mode === 'ATTACK' && ballMovingLeftNow) {
        score -= Math.max(0, res.end.p2.x - snapshot.p2.x) * 4;
      }

      // Mild jump cost (don’t spam)
      if (c.jumpOnStep0) score -= 40;

      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    return best;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}



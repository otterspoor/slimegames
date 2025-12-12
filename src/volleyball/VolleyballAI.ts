import * as Base from '../base/index.js';
import * as AI from '../ai/index.js';
import { VolleyballRolloutSimulator, type VolleyballWorldSnapshot, type P2Action } from './VolleyballRolloutSimulator.js';
import { planFromInput } from '../ai/UserIntent.js';

type MoveDir = -1 | 0 | 1;
type Mode = 'SERVE' | 'RECEIVE' | 'RALLY_ATTACK' | 'RALLY_DEFEND';

// Volleyball-specific AI (P2 / right side):
// - Win condition in rollout: ball hits left half ground (P2 point)
// - Loss condition in rollout: ball hits right half ground (P1 point)
// Strategy:
// - When ball is on our side: get "behind" it (to the right) and hit it left over/into opponent court.
// - When ball is on opponent side: position near the net to receive/contest the crossing.
// - Use short input rollouts to avoid conceding on our side and to prefer winning hits.
export class VolleyballAI extends AI.AIBase {
  private input = new AI.VirtualInput();
  private rollout = new VolleyballRolloutSimulator();
  private tick = 0;

  private moveDir: MoveDir = 0;
  private lastDirChangeTick = 0;

  private touchingSinceTick: number | null = null;
  private lastStrikeTick = -9999;
  private wasFrozen = false;
  private servePhaseUntilTick = 0;

  // Motion smoothing to avoid jitter
  private readonly enterMoveThreshold = 20; // px
  private readonly exitMoveThreshold = 12; // px
  private readonly dirSwitchDebounceTicks = 8; // ~133ms @ 60Hz

  // "Touch" heuristics (used for striking/jumping decisions)
  private readonly touchDist = Base.CONFIG.slimeRadius + Base.CONFIG.ballRadius + 18;
  private readonly touchMaxBallHeight = 190; // px above ground
  private readonly strikeCooldownTicks = 26; // ~430ms @ 60Hz (volleyball rally pace)
  private readonly maxTouchHoldTicks = 42; // ~700ms @ 60Hz (avoid infinite head juggling)
  private readonly verticalBounceXThreshold = Base.CONFIG.slimeRadius * 0.10; // match narrow "on-top" window

  getInput(slime: Base.SlimeBase, ball: Base.BallBase, opponent: Base.SlimeBase, opponentInput: Base.InputSource): Base.InputSource {
    this.tick++;
    const tick = this.tick;

    const groundY = Base.CONFIG.internalHeight - Base.CONFIG.groundHeight;
    const ballHeightAboveGround = groundY - ball.y;

    const netX = Base.CONFIG.internalWidth / 2;
    const halfNetW = Base.CONFIG.VOLLEYBALL_NET_W / 2;

    // P2 boundaries (right half)
    const minX = netX + halfNetW + Base.CONFIG.slimeRadius + 1;
    const maxX = Base.CONFIG.internalWidth - Base.CONFIG.slimeRadius - 1;

    const ballOnOurSide = ball.x >= netX;
    const ballNearNet = Math.abs(ball.x - netX) <= 55;

    // Detect serve/freeze (volleyball reset behavior)
    const now = Date.now();
    const isFrozen = now < ball.frozenUntil;
    const timeToUnfreeze = ball.frozenUntil - now;

    // Serve follow-through: right after the ball unfreezes on our side, stay in SERVE mode briefly
    // so we actively convert the drop into an attack rather than drifting into a vertical-juggle.
    if (this.wasFrozen && !isFrozen && ballOnOurSide) {
      this.servePhaseUntilTick = tick + 90; // ~1.5s
    }
    this.wasFrozen = isFrozen;

    let mode: Mode;
    if ((isFrozen && ballOnOurSide) || (ballOnOurSide && tick <= this.servePhaseUntilTick)) mode = 'SERVE';
    else if (!ballOnOurSide) mode = 'RECEIVE';
    else {
      // Ball on our side (rally): decide defend vs attack based on danger (low + falling)
      const lowAndFalling = ballHeightAboveGround < 85 && ball.vy > 0.8;
      mode = lowAndFalling ? 'RALLY_DEFEND' : 'RALLY_ATTACK';
    }

    // Touch tracking (for jump timing & spam reduction)
    const selfDist = Math.hypot(ball.x - slime.x, ball.y - slime.y);
    const canTouchBall = selfDist <= this.touchDist && ballHeightAboveGround <= this.touchMaxBallHeight;
    if (canTouchBall) {
      if (this.touchingSinceTick == null) this.touchingSinceTick = tick;
    } else {
      this.touchingSinceTick = null;
    }
    const timeTouchingTicks = this.touchingSinceTick == null ? 0 : (tick - this.touchingSinceTick);

    // --- Choose a horizontal target ---
    let targetX = slime.x;
    if (mode === 'SERVE') {
      // Stand under the ball; jump right as it becomes active so we "serve" it over the net.
      targetX = clamp(ball.x + 12, minX, maxX);
    } else if (mode === 'RECEIVE') {
      // Get ready near the net so we can contest the crossing.
      // If ball is moving toward our side, hug net; otherwise center up.
      const comingToUs = ball.vx > 0.5 || (ballNearNet && ball.vx > -0.2);
      targetX = comingToUs ? (netX + halfNetW + 65) : (Base.CONFIG.internalWidth * 0.78);
      targetX = clamp(targetX, minX, maxX);
    } else {
      // RALLY on our side:
      // Default: position slightly to the right of the ball so contact sends it left.
      const behindBallOffset = mode === 'RALLY_ATTACK' ? 42 : 22;
      targetX = clamp(ball.x + behindBallOffset, minX, maxX);
    }

    // --- Decide strike/jump ---
    const canStrike = (tick - this.lastStrikeTick) >= this.strikeCooldownTicks;
    const onGround = slime.y >= groundY;

    // Serve jump: time it close to unfreeze so the first collision sends it over.
    const shouldServeJump =
      mode === 'SERVE' &&
      canStrike &&
      onGround &&
      timeToUnfreeze <= 85 &&
      timeToUnfreeze >= -10 &&
      Math.abs(ball.x - slime.x) < 40;

    // If we missed the perfect unfreeze window, still jump-hit the first playable falling ball on serve.
    const serveBallHittable =
      mode === 'SERVE' &&
      !isFrozen &&
      canStrike &&
      onGround &&
      ball.vy > 0.3 &&
      ballHeightAboveGround <= 175 &&
      ballHeightAboveGround >= 35 &&
      Math.abs(ball.x - slime.x) < 55;

    // Rally hit: ball is on our side, in front (to our left), and at a hittable height.
    const ballInFrontForHit = ball.x < slime.x - 8 && ballHeightAboveGround <= 170;
    const shouldRallyHit =
      (mode === 'RALLY_ATTACK' || mode === 'RALLY_DEFEND') &&
      ballOnOurSide &&
      canStrike &&
      onGround &&
      ballInFrontForHit &&
      !isFrozen;

    // Anti-juggle: if we've been "touching" too long (often head-bounce control),
    // force a decisive jump-hit plan rather than stabilizing under the ball.
    const shouldForceSend =
      ballOnOurSide &&
      canTouchBall &&
      timeTouchingTicks >= this.maxTouchHoldTicks &&
      canStrike &&
      onGround &&
      !isFrozen;

    // Net contest/block: if ball is near net at mid height, jump to pop it back left.
    const shouldBlockAtNet =
      (mode === 'RECEIVE' || mode === 'RALLY_DEFEND') &&
      canStrike &&
      onGround &&
      ballNearNet &&
      ballHeightAboveGround <= 165 &&
      ballHeightAboveGround >= 40;

    const prefersJump = shouldServeJump || shouldRallyHit || shouldForceSend || shouldBlockAtNet;
    const prefersJumpWithServe = prefersJump || serveBallHittable;

    // Rollout-based selection: pick action (+ optional jump) that avoids conceding and prefers scoring.
    const p1Plan = planFromInput(opponentInput, true);
    const plan = this.pickPlanByRollout(slime, opponent, ball, prefersJumpWithServe, p1Plan);
    if (plan.jumpOnStep0 && onGround && canStrike) {
      this.lastStrikeTick = tick;
    }

    // If we're about to jump-hit, bias target to step into the ball from the right.
    if (plan.jumpOnStep0 && ballOnOurSide) {
      targetX = clamp(ball.x + 30, minX, maxX);
    }

    // --- Convert to virtual keys ---
    // Like soccer AI, we keep a smoothed dir state, but we always apply the rollout decision
    // as authoritative to match the simulated plan.
    const errorX = targetX - slime.x;
    const absErrorX = Math.abs(errorX);

    if (this.moveDir !== 0 && absErrorX <= this.exitMoveThreshold) {
      this.moveDir = 0;
      this.lastDirChangeTick = tick;
    }
    if (this.moveDir === 0 && absErrorX >= this.enterMoveThreshold) {
      this.moveDir = errorX > 0 ? 1 : -1;
      this.lastDirChangeTick = tick;
    }
    const desiredDir: MoveDir = absErrorX >= this.enterMoveThreshold ? (errorX > 0 ? 1 : -1) : 0;
    const wantsSwitch = this.moveDir !== 0 && desiredDir !== 0 && desiredDir !== this.moveDir;
    if (wantsSwitch && (tick - this.lastDirChangeTick) >= this.dirSwitchDebounceTicks) {
      this.moveDir = desiredDir as MoveDir;
      this.lastDirChangeTick = tick;
    }

    this.input.clear();
    this.input.setKey('ArrowRight', plan.action === 'RIGHT');
    this.input.setKey('ArrowLeft', plan.action === 'LEFT');
    this.input.setKey('ArrowUp', plan.jumpOnStep0 && onGround);

    return this.input;
  }

  private pickPlanByRollout(
    slime: Base.SlimeBase,
    opponent: Base.SlimeBase,
    ball: Base.BallBase,
    prefersJump: boolean,
    p1Plan: ReturnType<typeof planFromInput>
  ): { action: P2Action; jumpOnStep0: boolean } {
    const snapshot: VolleyballWorldSnapshot = {
      p1: { x: opponent.x, y: opponent.y, vx: opponent.vx, vy: opponent.vy },
      p2: { x: slime.x, y: slime.y, vx: slime.vx, vy: slime.vy },
      ball: { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy },
    };

    const candidates: Array<{ action: P2Action; jumpOnStep0: boolean }> = [
      { action: 'LEFT', jumpOnStep0: false },
      { action: 'RIGHT', jumpOnStep0: false },
      { action: 'NONE', jumpOnStep0: false },
    ];
    if (prefersJump) {
      candidates.push({ action: 'LEFT', jumpOnStep0: true });
      candidates.push({ action: 'RIGHT', jumpOnStep0: true });
      candidates.push({ action: 'NONE', jumpOnStep0: true });
    }

    const horizon = 55; // ~0.9s
    const netX = Base.CONFIG.internalWidth / 2;
    const groundY = Base.CONFIG.internalHeight - Base.CONFIG.groundHeight;

    let best = candidates[0];
    let bestScore = -Infinity;

    for (const c of candidates) {
      const res = this.rollout.simulate(snapshot, horizon, c, {
        p1Plan: { action: p1Plan.action, jumpOnStep0: p1Plan.jumpOnStep0 }
      });

      if (res.verdict === 'loss') {
        // Heavily penalize conceding on our side; prefer delaying if unavoidable
        const score = -1_000_000 + (res.step ?? horizon);
        if (score > bestScore) { bestScore = score; best = c; }
        continue;
      }

      let score = 0;
      if (res.verdict === 'win') {
        score += 100_000 - (res.step ?? horizon);

        // While still scoring, prefer the landing point to be as far from the opponent as possible.
        // (Opposition is P1 in the rollout state.)
        score += Math.abs(res.end.ball.x - res.end.p1.x) * 14;
      } else {
        // No point yet: push ball to opponent side and keep it high on ours.
        const endBallOnOppSide = res.end.ball.x < netX;
        score += endBallOnOppSide ? 2600 : -900;

        // Prefer leftward velocity (sending it over)
        score += (-res.end.ball.vx) * 180;

        // Penalize ball ending low on our side (likely to concede soon)
        const endBallHeightAboveGround = groundY - res.end.ball.y;
        if (!endBallOnOppSide) {
          score -= Math.max(0, 95 - endBallHeightAboveGround) * 22;
        } else {
          // If we're already on their side, also prefer positions farther from the opponent.
          score += Math.abs(res.end.ball.x - res.end.p1.x) * 2.2;
        }
      }

      // Always value "getting to the ball" on our side.
      score -= Math.abs(res.end.ball.x - res.end.p2.x) * 3.8;

      // Strong anti-stall / anti-wall-loop:
      // Progressively penalize plans that go a long time without the ball crossing the net.
      // This makes "hit it across" plans dominate, especially after repeated non-cross periods.
      const endNoCross = res.metrics.endNoCrossTicks;
      const maxNoCross = res.metrics.maxNoCrossTicks;
      score -= (endNoCross * endNoCross) * 18;
      score -= (maxNoCross * maxNoCross) * 4;
      if (res.metrics.netCrossings === 0) score -= 9000;
      score += res.metrics.netCrossings * 650;

      // Anti-juggle planning: LARGE negative reward for "vertical bounce" outcomes:
      // ball stays on our side, ends up high and centered above P2, with ~0 horizontal velocity.
      const endBallOnOurSide = res.end.ball.x >= netX;
      if (endBallOnOurSide) {
        const endDx = res.end.ball.x - res.end.p2.x;
        const endHeightAboveGround = groundY - res.end.ball.y;
        const centered = Math.abs(endDx) < (this.verticalBounceXThreshold * 1.2);
        const nearVertical = Math.abs(res.end.ball.vx) < 0.35;
        // Penalize even at medium heights (serve bounce loops often sit ~60-120px above ground).
        const notOnGround = endHeightAboveGround > 40;
        if (notOnGround && centered && nearVertical) {
          score -= 20000;
          // Extra penalty when the ball is still fairly high (more likely to keep looping).
          if (endHeightAboveGround > 110) score -= 5000;
        }
      }

      // Mild jump cost (don’t spam).
      if (c.jumpOnStep0) score -= 35;

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



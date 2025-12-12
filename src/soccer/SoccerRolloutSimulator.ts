import * as Base from '../base/index.js';
import * as Soccer from './index.js';
import type { MoveAction } from '../ai/UserIntent.js';

type ScoreEvent = { scoringPlayer: 1 | 2; step: number };

class FakeGame implements Base.GameInterface {
  public lastScore: ScoreEvent | null = null;

  scorePoint(scoringPlayer: number): void {
    this.lastScore = { scoringPlayer: scoringPlayer as 1 | 2, step: 0 };
  }

  getTotalScore(): number {
    return 0;
  }
}

class AlwaysUpInput implements Base.InputSource {
  constructor(private readonly codesDown: Set<string>) {}
  isDown(code: string): boolean {
    return this.codesDown.has(code);
  }
}

export interface SoccerWorldSnapshot {
  p1: { x: number; y: number; vx: number; vy: number };
  p2: { x: number; y: number; vx: number; vy: number };
  ball: { x: number; y: number; vx: number; vy: number };
}

export type P2Action = 'LEFT' | 'RIGHT' | 'NONE';
export type P1Action = MoveAction;

export interface RolloutResult {
  verdict: 'none' | 'win' | 'loss';
  step: number | null;
  end: SoccerWorldSnapshot;
}

// Input-based rollout using the *real* soccer classes (SlimeSoccer + BallSoccer).
// This keeps the AI "fair": it can only choose inputs; physics is identical.
export class SoccerRolloutSimulator {
  simulate(
    snapshot: SoccerWorldSnapshot,
    steps: number,
    plan: { action: P2Action; jumpOnStep0: boolean },
    opts?: { p1Input?: Base.InputSource; p1Plan?: { action: P1Action; jumpOnStep0: boolean } }
  ): RolloutResult {
    const fakeGame = new FakeGame();

    const p1 = new Soccer.SlimeSoccer(true);
    const p2 = new Soccer.SlimeSoccer(false);
    const ball = new Soccer.BallSoccer(fakeGame);

    // restore state
    p1.x = snapshot.p1.x; p1.y = snapshot.p1.y; p1.vx = snapshot.p1.vx; p1.vy = snapshot.p1.vy;
    p2.x = snapshot.p2.x; p2.y = snapshot.p2.y; p2.vx = snapshot.p2.vx; p2.vy = snapshot.p2.vy;
    ball.x = snapshot.ball.x; ball.y = snapshot.ball.y; ball.vx = snapshot.ball.vx; ball.vy = snapshot.ball.vy;
    ball.prevX = ball.x; ball.prevY = ball.y;
    ball.frozenUntil = 0;

    // Default opponent input: stationary (neutral).
    // If a p1Plan is provided, we use it (this is the "predict next" path).
    const p1Input = opts?.p1Plan
      ? this.buildP1Input(opts.p1Plan.action, opts.p1Plan.jumpOnStep0)
      : (opts?.p1Input ?? new AlwaysUpInput(new Set()));

    for (let i = 0; i < steps; i++) {
      const jump = (i === 0) && plan.jumpOnStep0;
      const p2Input = this.buildP2Input(plan.action, jump);

      p1.update(p1Input);
      p2.update(p2Input);

      ball.update(p1, p2);

      if (fakeGame.lastScore) {
        // Patch in the step for reporting
        fakeGame.lastScore.step = i + 1;
        const scoringPlayer = fakeGame.lastScore.scoringPlayer;

        // In soccer:
        // - scoringPlayer=2 means LEFT goal (P2 scores) => AI win
        // - scoringPlayer=1 means RIGHT goal (P1 scores) => AI loss
        if (scoringPlayer === 2) {
          return { verdict: 'win', step: i + 1, end: this.snapshot(p1, p2, ball) };
        } else {
          return { verdict: 'loss', step: i + 1, end: this.snapshot(p1, p2, ball) };
        }
      }
    }

    return { verdict: 'none', step: null, end: this.snapshot(p1, p2, ball) };
  }

  private buildP2Input(action: P2Action, jump: boolean): Base.InputSource {
    const down = new Set<string>();
    if (action === 'LEFT') down.add('ArrowLeft');
    if (action === 'RIGHT') down.add('ArrowRight');
    if (jump) down.add('ArrowUp');
    return new AlwaysUpInput(down);
  }

  private buildP1Input(action: P1Action, jump: boolean): Base.InputSource {
    const down = new Set<string>();
    if (action === 'LEFT') down.add('KeyA');
    if (action === 'RIGHT') down.add('KeyD');
    if (jump) down.add('KeyW');
    return new AlwaysUpInput(down);
  }

  private snapshot(p1: Base.SlimeBase, p2: Base.SlimeBase, ball: Base.BallBase): SoccerWorldSnapshot {
    return {
      p1: { x: p1.x, y: p1.y, vx: p1.vx, vy: p1.vy },
      p2: { x: p2.x, y: p2.y, vx: p2.vx, vy: p2.vy },
      ball: { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy },
    };
  }
}



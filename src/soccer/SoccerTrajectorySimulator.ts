import * as Base from '../base/index.js';
import { SimulationBase, type SimulationOutcome } from '../ai/index.js';

export type GoalSide = 'LEFT' | 'RIGHT';

export interface BallSimState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// Forward simulate soccer ball motion (approximate, but matches the important scoring rules).
// Interpretation:
// - verdict: 'win'  => goal on LEFT (P2 scores)
// - verdict: 'loss' => goal on RIGHT (P2 concedes)
export class SoccerTrajectorySimulator extends SimulationBase<BallSimState, { goalSide: GoalSide }> {
  protected step(s: Readonly<BallSimState>): BallSimState {
    const r = Base.CONFIG.ballRadius;
    const groundY = Base.CONFIG.internalHeight - Base.CONFIG.groundHeight;
    const goalTopY = groundY - Base.CONFIG.SOCCER_GOAL_H;
    const crossR = Base.CONFIG.SOCCER_CROSSBAR_R;

    let x = s.x;
    let y = s.y;
    let vx = s.vx;
    let vy = s.vy;

    // Universal-ish physics (matches BallBase update)
    vy += Base.CONFIG.gravity;
    vx *= Base.CONFIG.friction;
    vy *= Base.CONFIG.friction;

    x += vx;
    y += vy;

    // Top wall (BallBase.checkUniversalBoundaries)
    if (y < r) {
      y = r;
      vy = Math.abs(vy) * 0.5;
    }

    // Ground bounce (BallSoccer.checkGameGeometry)
    if (y + r > groundY) {
      y = groundY - r;
      vy *= -0.80;
      vx *= 0.95;
    }

    // Side walls / goal openings (BallSoccer.checkGameGeometry)
    // Left side
    if (x < r) {
      if (y < goalTopY) {
        x = r;
        vx *= -0.8;
      }
      // else: goal opening (handled by terminal check when x < -r)
    }
    // Right side
    if (x > Base.CONFIG.internalWidth - r) {
      if (y < goalTopY) {
        x = Base.CONFIG.internalWidth - r;
        vx *= -0.8;
      }
      // else: goal opening (handled by terminal check when x > width + r)
    }

    // Crossbars (BallSoccer.checkGameGeometry)
    ({ x, y, vx, vy } = resolveCircleCollision(x, y, vx, vy, 0, goalTopY, crossR, r));
    ({ x, y, vx, vy } = resolveCircleCollision(x, y, vx, vy, Base.CONFIG.internalWidth, goalTopY, crossR, r));

    return { x, y, vx, vy };
  }

  protected terminal(s: Readonly<BallSimState>, step: number): SimulationOutcome<{ goalSide: GoalSide }> | null {
    const r = Base.CONFIG.ballRadius;
    const groundY = Base.CONFIG.internalHeight - Base.CONFIG.groundHeight;
    const goalTopY = groundY - Base.CONFIG.SOCCER_GOAL_H;

    // Soccer scoring conditions from BallSoccer:
    // - left goal scores for P2 when x < -r and y is in the opening (>= goalTopY)
    // - right goal scores for P1 when x > width + r and y is in the opening (>= goalTopY)
    if (s.y >= goalTopY) {
      if (s.x < -r) return { verdict: 'win', step, meta: { goalSide: 'LEFT' } };
      if (s.x > Base.CONFIG.internalWidth + r) return { verdict: 'loss', step, meta: { goalSide: 'RIGHT' } };
    }
    return null;
  }
}

function resolveCircleCollision(
  x: number,
  y: number,
  vx: number,
  vy: number,
  cx: number,
  cy: number,
  cr: number,
  ballR: number
): { x: number; y: number; vx: number; vy: number } {
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = ballR + cr;

  if (dist < minDist && dist > 0) {
    const angle = Math.atan2(dy, dx);
    const overlap = minDist - dist;
    x += Math.cos(angle) * overlap;
    y += Math.sin(angle) * overlap;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    const dot = vx * nx + vy * ny;
    // Match BallBase.resolveCircleCollision restitution (~1.8)
    vx = vx - 1.8 * dot * nx;
    vy = vy - 1.8 * dot * ny;
  }

  return { x, y, vx, vy };
}



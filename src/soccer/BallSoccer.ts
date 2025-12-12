import * as Base from '../base/index.js';

// --- BALL SOCCER (Soccer-Specific Logic) ---
export class BallSoccer extends Base.BallBase {
  constructor(game: Base.GameInterface) {
    super();
    this.game = game;
  }

  reset(): void {
    this.x = Base.CONFIG.internalWidth / 2;
    this.y = 200;
    this.prevX = this.x;
    this.prevY = this.y;
    this.vx = 0;
    this.vy = 0;
    this.frozenUntil = Date.now() + 200; // 200ms delay before ball starts falling
  }

  checkGameGeometry(): void {
    if (!this.game) return;
    
    const r = Base.CONFIG.ballRadius; 
    const groundY = Base.CONFIG.internalHeight - Base.CONFIG.groundHeight;
    const goalTopY = groundY - Base.CONFIG.SOCCER_GOAL_H;
    
    // Ground Bounce
    if (this.y + r > groundY) {
      this.y = groundY - r;
      this.vy *= -0.80; 
      this.vx *= 0.95;  
    }

    // Side Walls/Goals
    if (this.x < r) {
      if (this.y < goalTopY) {
        this.x = r;
        this.vx *= -0.8;
      } else {
        if (this.x < -r) this.game.scorePoint(2); // Goal P2
      }
    }

    if (this.x > Base.CONFIG.internalWidth - r) {
      if (this.y < goalTopY) {
        this.x = Base.CONFIG.internalWidth - r;
        this.vx *= -0.8;
      } else {
        if (this.x > Base.CONFIG.internalWidth + r) this.game.scorePoint(1); // Goal P1
      }
    }
    
    // Crossbars
    this.resolveCircleCollision(0, goalTopY, Base.CONFIG.SOCCER_CROSSBAR_R);
    this.resolveCircleCollision(Base.CONFIG.internalWidth, goalTopY, Base.CONFIG.SOCCER_CROSSBAR_R);
  }

  // Soccer uses the base class's generic physics for all velocity resolution.
  // BUT: we intentionally narrow the "directly on top" (header/juggle) window for soccer
  // so you can't bounce the ball on your head indefinitely.
  resolveSlimeHit(slime: Base.SlimeBase, angle: number, isStomp: boolean, dx: number): void {
    const popForce = Base.CONFIG.popForce;

    // Soccer-only: make "perfect on-head" control much harder.
    const horizontalThreshold = Base.CONFIG.slimeRadius * 0.10; // was 0.30 in base
    const isDirectlyOnTop = Math.abs(dx) < horizontalThreshold;

    const slimeHorizontalMomentum = slime.vx * 1.25; // slightly less "stickiness" than base

    if (isStomp) {
      if (isDirectlyOnTop) {
        // Instead of a perfectly vertical juggle, add a small sideways drift so it won't repeat forever.
        const dxPrev = this.prevX - slime.x;
        const driftDir = dxPrev === 0 ? (slime.vx >= 0 ? 1 : -1) : (dxPrev > 0 ? 1 : -1);
        this.vx = slimeHorizontalMomentum + driftDir * 3.0;
        this.vy = -8.5 + (slime.vy * 0.45);
      } else {
        const horizontalDir = dx > 0 ? 1 : -1;
        const lateralForce = 12;
        const angleBasedForce = horizontalDir * lateralForce;
        this.vx = angleBasedForce + slimeHorizontalMomentum;
        this.vy = -10 + (slime.vy * 0.5);
      }
    } else {
      if (isDirectlyOnTop) {
        // Non-stomp "header": reduce vertical power and add small drift to prevent stable looping.
        const dxPrev = this.prevX - slime.x;
        const driftDir = dxPrev === 0 ? (slime.vx >= 0 ? 1 : -1) : (dxPrev > 0 ? 1 : -1);
        this.vx = slimeHorizontalMomentum + driftDir * 2.2;
        this.vy = -(popForce * 0.78) + (slime.vy * 0.9);
      } else {
        const angleBasedForce = Math.cos(angle) * popForce;
        this.vx = angleBasedForce + slimeHorizontalMomentum;
        const newVy = Math.sin(angle) * popForce + (slime.vy * 1.1);
        this.vy = Math.min(newVy, 15);
      }
    }

    // Same post-hit clamp as base
    const postHitSpeed = Math.hypot(this.vx, this.vy);
    if (postHitSpeed > Base.CONFIG.ballMaxSpeed) {
      const scale = Base.CONFIG.ballMaxSpeed / postHitSpeed;
      this.vx *= scale;
      this.vy *= scale;
    }
  }
  
  draw(ctx: CanvasRenderingContext2D): void {
    const r = Base.CONFIG.ballRadius;
    // Draw common white circle
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    // Soccer detail (center dot)
    ctx.beginPath();
    ctx.arc(this.x, this.y, r/2, 0, Math.PI*2);
    ctx.fillStyle = '#000';
    ctx.fill();
  }
}


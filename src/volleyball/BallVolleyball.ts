import * as Base from '../base/index.js';

// --- BALL VOLLEYBALL (Volleyball-Specific Logic) ---
export class BallVolleyball extends Base.BallBase {
  constructor(game: Base.GameInterface) {
    super();
    this.game = game;
  }

  reset(serverSlime: Base.SlimeBase | null = null): void {
    if (!serverSlime) return;
    
    this.x = serverSlime.x;
    this.y = serverSlime.y - 150;
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
    const netW = Base.CONFIG.VOLLEYBALL_NET_W;
    const netH = Base.CONFIG.VOLLEYBALL_NET_H;
    const netX = Base.CONFIG.internalWidth / 2;
    const halfNetW = netW / 2;
    const netTopY = groundY - netH;

    // Ground Scoring
    if (this.y + r > groundY) {
      if (this.x < netX) this.game.scorePoint(2); 
      else this.game.scorePoint(1); 
      return;
    }

    // Side Walls
    if (this.x < r) { this.x = r; this.vx *= -1; }
    if (this.x > Base.CONFIG.internalWidth - r) { this.x = Base.CONFIG.internalWidth - r; this.vx *= -1; }
    
    // Net Collision Logic
    const capCenterY = netTopY + halfNetW;
    const dx = this.x - netX;
    const dy = this.y - capCenterY;
    const distToCap = Math.hypot(dx, dy);

    // Net cap collision
    if (this.y < capCenterY && distToCap < r + halfNetW) {
      this.resolveCircleCollision(netX, capCenterY, halfNetW);
      return;
    }

    // Net post collision 
    if (this.y >= capCenterY) {
      const leftEdge = netX - halfNetW - r;
      const rightEdge = netX + halfNetW + r;
      if (this.prevX <= leftEdge && this.x > leftEdge) {
        this.x = leftEdge;
        this.vx *= -0.7;
      }
      else if (this.prevX >= rightEdge && this.x < rightEdge) {
        this.x = rightEdge;
        this.vx *= -0.7;
      }
    }
  }

  // Volleyball uses the base class's generic physics for velocity resolution,
  // BUT: like soccer, we narrow the "directly on top" (stable head juggle) window.
  // Unlike soccer, we do NOT add any horizontal drift/variance here.
  resolveSlimeHit(slime: Base.SlimeBase, angle: number, isStomp: boolean, dx: number): void {
    const popForce = Base.CONFIG.popForce;

    // Volleyball: make "perfect on-head" control harder by narrowing the threshold.
    // (Base is 0.30; soccer uses 0.10; we match soccer's strictness here.)
    const horizontalThreshold = Base.CONFIG.slimeRadius * 0.10;
    const isDirectlyOnTop = Math.abs(dx) < horizontalThreshold;

    const slimeHorizontalMomentum = slime.vx * 1.5;

    if (isStomp) {
      if (isDirectlyOnTop) {
        // Pure vertical bounce with inherited horizontal momentum (no extra drift).
        this.vx = slimeHorizontalMomentum;
        this.vy = -10 + (slime.vy * 0.5);
      } else {
        const horizontalDir = dx > 0 ? 1 : -1;
        const lateralForce = 12;
        const angleBasedForce = horizontalDir * lateralForce;
        this.vx = angleBasedForce + slimeHorizontalMomentum;
        this.vy = -10 + (slime.vy * 0.5);
      }
    } else {
      if (isDirectlyOnTop) {
        // Pure vertical pop with inherited horizontal momentum (no extra drift).
        this.vx = slimeHorizontalMomentum;
        this.vy = -popForce + (slime.vy * 1.1);
      } else {
        const angleBasedForce = Math.cos(angle) * popForce;
        this.vx = angleBasedForce + slimeHorizontalMomentum;
        const newVy = Math.sin(angle) * popForce + (slime.vy * 1.1);
        this.vy = Math.min(newVy, 15);
      }
    }

    // Clamp AFTER collision resolution too (same as base).
    const postHitSpeed = Math.hypot(this.vx, this.vy);
    if (postHitSpeed > Base.CONFIG.ballMaxSpeed) {
      const scale = Base.CONFIG.ballMaxSpeed / postHitSpeed;
      this.vx *= scale;
      this.vy *= scale;
    }
  }
  
  draw(ctx: CanvasRenderingContext2D): void {
    const r = Base.CONFIG.ballRadius;
    // Volleyball details (Orange)
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'hsl(36, 100%, 50%)';
    ctx.fill();
    ctx.strokeStyle = '#d35400';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}


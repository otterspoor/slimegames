import { CONFIG } from './config.js';
import { SlimeBase } from './SlimeBase.js';

// Forward declaration to avoid circular dependency
export interface GameInterface {
  scorePoint(scoringPlayer: number): void;
  getTotalScore(): number;
}

// --- BALL BASE CLASS (Universal Physics Engine) ---
export abstract class BallBase {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  game: GameInterface | null;
  frozenUntil: number; // Timestamp when ball should start moving (for reset delay)

  constructor() {
    this.x = 0;
    this.y = 0;
    this.prevX = 0;
    this.prevY = 0;
    this.vx = 0;
    this.vy = 0;
    this.game = null; // Will be set in the Game constructor
    this.frozenUntil = 0;
  }
  
  // Abstract methods
  abstract reset(serverSlime?: SlimeBase | null): void;
  abstract checkGameGeometry(): void;
  abstract draw(ctx: CanvasRenderingContext2D): void;

  update(p1: SlimeBase, p2: SlimeBase): void {
    // Check if ball is frozen (delay after reset)
    const now = Date.now();
    if (now < this.frozenUntil) {
      return; // Don't update physics while frozen
    }
    
    this.prevX = this.x;
    this.prevY = this.y;
    
    // Universal Physics
    this.vy += CONFIG.gravity;
    this.vx *= CONFIG.friction;
    this.vy *= CONFIG.friction;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > CONFIG.ballMaxSpeed) {
      const scale = CONFIG.ballMaxSpeed / speed;
      this.vx *= scale;
      this.vy *= scale;
    }

    this.x += this.vx;
    this.y += this.vy;
    this.checkUniversalBoundaries();
    this.checkGameGeometry(); 
    
    this.checkSlimeCollision(p1); 
    this.checkSlimeCollision(p2); 
  }
  
  checkUniversalBoundaries(): void {
    const r = CONFIG.ballRadius; 
    
    // Top Wall
    if (this.y < r) {
      this.y = r;
      this.vy = Math.abs(this.vy) * 0.5;
    }
  }

  // Helper function for geometric collisions (goals, net caps)
  resolveCircleCollision(cx: number, cy: number, cr: number): void {
    const dx = this.x - cx;
    const dy = this.y - cy;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const minDist = CONFIG.ballRadius + cr;
    if (dist < minDist && dist > 0) {
      const angle = Math.atan2(dy, dx);
      const overlap = minDist - dist;
      this.x += Math.cos(angle) * overlap;
      this.y += Math.sin(angle) * overlap;
      const nx = Math.cos(angle);
      const ny = Math.sin(angle);
      const dot = this.vx * nx + this.vy * ny;
      this.vx = (this.vx - 1.8 * dot * nx);
      this.vy = (this.vy - 1.8 * dot * ny);
    }
  }
  
  // --- CORE UNIVERSAL SLIME COLLISION DETECTION & GEOMETRY CORRECTION ---
  checkSlimeCollision(slime: SlimeBase): void {
    const slimeRadius = CONFIG.slimeRadius; 
    const ballRadius = CONFIG.ballRadius; 
    const dx = this.x - slime.x;
    const dy = this.y - slime.y;
    const dist = Math.hypot(dx, dy);
    const minDist = slimeRadius + ballRadius;

    if (dist < minDist) {
      if (dist === 0 || dy > 0) return; // Prevent sticking below base
      
      // 1. Position Correction (Universal)
      const angle = Math.atan2(dy, dx);
      const overlap = minDist - dist;
      this.x += Math.cos(angle) * overlap;
      this.y += Math.sin(angle) * overlap;

      // 2. Determine Collision Type
      const isStomp = Math.sin(angle) < -0.8; 

      // 3. Resolve velocity using generic physics
      this.resolveSlimeHit(slime, angle, isStomp, dx);
    }
  }
  
  // --- GENERIC UNIVERSAL SLIME VELOCITY RESOLUTION ---
  // This is now generic and works for both soccer and volleyball
  resolveSlimeHit(slime: SlimeBase, angle: number, isStomp: boolean, dx: number): void {
    const popForce = CONFIG.popForce; 
    
    // Check if ball is directly on top of slime (within threshold for vertical bounce)
    const horizontalThreshold = CONFIG.slimeRadius * 0.3; // 30% of slime radius
    const isDirectlyOnTop = Math.abs(dx) < horizontalThreshold;
    
    // Slime's horizontal momentum should be a major component
    // When slime is moving, ball should inherit that momentum strongly
    const slimeHorizontalMomentum = slime.vx * 1.5; // Strong inheritance of horizontal velocity
    
    if (isStomp) {
      if (isDirectlyOnTop) {
        // Directly on top - bounce straight up vertically, but preserve slime's horizontal movement
        this.vx = slimeHorizontalMomentum; // Full horizontal momentum from slime
        this.vy = -10 + (slime.vy * 0.5); // Strong upward force
      } else {
        // Universal stomp-out logic
        // Determine horizontal direction based on position relative to slime center
        const horizontalDir = dx > 0 ? 1 : -1; 
        const lateralForce = 12; // Force to push it out sideways
        
        // Combine angle-based force with slime's horizontal momentum
        // Slime's momentum should dominate when it's moving
        const angleBasedForce = horizontalDir * lateralForce;
        this.vx = angleBasedForce + slimeHorizontalMomentum; 
        this.vy = -10 + (slime.vy * 0.5);
      }
    } else {
      if (isDirectlyOnTop) {
        // Directly on top - bounce straight up vertically, preserve slime's horizontal movement
        this.vx = slimeHorizontalMomentum; // Full horizontal momentum from slime
        this.vy = -popForce + (slime.vy * 1.1); // Strong upward force
      } else {
        // Generic kick (Side/Up hit)
        // Combine angle-based force with slime's horizontal momentum
        // When slime is moving, its momentum should be more prominent
        const angleBasedForce = Math.cos(angle) * popForce;
        this.vx = angleBasedForce + slimeHorizontalMomentum; 
        let newVy = Math.sin(angle) * popForce + (slime.vy * 1.1); 
        this.vy = Math.min(newVy, 15);
      }
    }

    // Clamp AFTER collision resolution too.
    // Otherwise, collisions can temporarily inject > max speed and feel like "auto-acceleration".
    const postHitSpeed = Math.hypot(this.vx, this.vy);
    if (postHitSpeed > CONFIG.ballMaxSpeed) {
      const scale = CONFIG.ballMaxSpeed / postHitSpeed;
      this.vx *= scale;
      this.vy *= scale;
    }
  }
}


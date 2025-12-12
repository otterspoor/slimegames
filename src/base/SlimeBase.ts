import { CONFIG } from './config.js';
import { BallBase } from './BallBase.js';

export interface InputSource {
  isDown(code: string): boolean;
}

// --- SLIME BASE CLASS (Universal Movement) ---
export abstract class SlimeBase {
  isPlayer1: boolean;
  color: string;
  startPos: { x: number; y: number };
  x: number;
  y: number;
  vx: number;
  vy: number;
  grabStateActiveUntil: number = 0; // Timestamp when grab state expires (0 = inactive)

  constructor(isPlayer1: boolean, color: string) {
    this.isPlayer1 = isPlayer1;
    this.color = color; 
    this.startPos = {
      x: isPlayer1 ? CONFIG.internalWidth * 0.20 : CONFIG.internalWidth * 0.80,
      y: CONFIG.internalHeight - CONFIG.groundHeight
    };
    this.x = this.startPos.x;
    this.y = this.startPos.y;
    this.vx = 0;
    this.vy = 0;
  }

  reset(): void {
    this.x = this.startPos.x; 
    this.y = this.startPos.y;
    this.vx = 0;
    this.vy = 0;
    this.grabStateActiveUntil = 0;
  }

  // Check if grab state is currently active
  isGrabStateActive(): boolean {
    return Date.now() < this.grabStateActiveUntil;
  }

  // Activate grab state for a duration (in milliseconds)
  activateGrabState(duration: number = 400): void {
    this.grabStateActiveUntil = Date.now() + duration;
  }
  
  // Abstract method to be overridden by child classes
  abstract applyBoundaries(): void;

  update(input: InputSource): void {
    let moveLeft: boolean, moveRight: boolean, jump: boolean;
    if (this.isPlayer1) {
      moveLeft = input.isDown('KeyA');
      moveRight = input.isDown('KeyD');
      jump = input.isDown('KeyW');
    } else {
      moveLeft = input.isDown('ArrowLeft');
      moveRight = input.isDown('ArrowRight');
      jump = input.isDown('ArrowUp');
    }

    this.vx = 0;
    if (moveLeft) this.vx = -CONFIG.slimeSpeed; 
    if (moveRight) this.vx = CONFIG.slimeSpeed; 
    if (jump && this.y >= CONFIG.internalHeight - CONFIG.groundHeight) {
      this.vy = -CONFIG.slimeJumpForce; 
    }

    this.vy += CONFIG.gravity;
    this.x += this.vx;
    this.y += this.vy;

    const groundY = CONFIG.internalHeight - CONFIG.groundHeight;
    if (this.y > groundY) {
      this.y = groundY;
      this.vy = 0;
    }

    this.applyBoundaries();
  }

  draw(ctx: CanvasRenderingContext2D, ball: BallBase | null, showGrabState: boolean = false): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    const currentRadius = CONFIG.slimeRadius; 

    // Body (Semi-Circle)
    ctx.beginPath();
    ctx.arc(0, 0, currentRadius, Math.PI, 0);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.strokeStyle = '#222';
    // Thicker stroke when a special state is active (e.g. grab/catch mechanics)
    ctx.lineWidth = showGrabState ? 5 : 2;
    ctx.stroke();
    
    // Bottom Line
    ctx.beginPath();
    ctx.moveTo(-currentRadius, 0);
    ctx.lineTo(currentRadius, 0);
    ctx.stroke();

    // Eye Logic
    const dirX = this.isPlayer1 ? 1 : -1;
    const eyeX = dirX * (currentRadius * 0.3); 
    const eyeY = -(currentRadius * 0.56);
    
    const bx = ball ? ball.x : 0;
    const by = ball ? ball.y : 0;
    const dx = bx - (this.x + eyeX);
    const dy = by - (this.y + eyeY);
    const angle = Math.atan2(dy, dx);
    
    const pupilDist = 4;
    // Eye White
    const eyeRadius = currentRadius * 0.16;
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, eyeRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.stroke();
    // Pupil
    ctx.beginPath();
    ctx.arc(eyeX + Math.cos(angle) * pupilDist, eyeY + Math.sin(angle) * pupilDist, eyeRadius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();

    ctx.restore();
  }
}



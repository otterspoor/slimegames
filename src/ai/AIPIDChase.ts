import { AIBase } from './AIBase.js';
import { VirtualInput } from './VirtualInput.js';
import * as Base from '../base/index.js';

// Simple PID controller that chases the ball horizontally.
// (Jump/throw/catch logic can be layered in per-game later.)
export class AIPIDChase extends AIBase {
  private input = new VirtualInput();

  private integral = 0;
  private prevError = 0;

  private moveDir: -1 | 0 | 1 = 0;
  private lastDirChangeTick = 0;
  private tick = 0;

  // Tunables (good starting point for discrete left/right control)
  private readonly kp = 0.08;
  private readonly ki = 0.0003;
  private readonly kd = 0.06;

  private readonly integralClamp = 5000;

  // Hysteresis to avoid "vibrating" around the target.
  // - Start moving only once we're clearly away from target
  // - Stop moving once we're comfortably close again
  private readonly enterMoveThreshold = 24; // px
  private readonly exitMoveThreshold = 14; // px
  private readonly dirSwitchDebounceTicks = 9; // ~150ms @ 60Hz

  getInput(slime: Base.SlimeBase, ball: Base.BallBase, opponent: Base.SlimeBase, opponentInput: Base.InputSource): VirtualInput {
    this.tick++;
    const tick = this.tick;
    // Fixed timestep: the game loop runs at ~60 updates/sec.
    const dt = 1 / 60;

    const error = ball.x - slime.x;
    this.integral += error * dt;
    this.integral = Math.max(-this.integralClamp, Math.min(this.integralClamp, this.integral));

    // Clamp derivative to reduce jitter sensitivity when the ball/slime are colliding.
    const rawDerivative = (error - this.prevError) / dt;
    const derivative = Math.max(-1500, Math.min(1500, rawDerivative));
    this.prevError = error;

    const output = (this.kp * error) + (this.ki * this.integral) + (this.kd * derivative);
    // We keep the PID calculation (useful later), but map to discrete left/right buttons with hysteresis.
    // This prevents rapid back-and-forth toggling when error hovers around 0.
    const desiredVx = Math.max(-Base.CONFIG.slimeSpeed, Math.min(Base.CONFIG.slimeSpeed, output));

    this.input.clear();

    const absError = Math.abs(error);

    // Decide whether to stop
    if (this.moveDir !== 0 && absError <= this.exitMoveThreshold) {
      this.moveDir = 0;
      this.lastDirChangeTick = tick;
    }

    // Decide whether to start moving (from idle)
    if (this.moveDir === 0 && absError >= this.enterMoveThreshold) {
      this.moveDir = error > 0 ? 1 : -1;
      this.lastDirChangeTick = tick;
    }

    // Decide whether to switch direction (debounced)
    const desiredDir: -1 | 1 = error > 0 ? 1 : -1;
    const wantsSwitch = this.moveDir !== 0 && desiredDir !== this.moveDir && absError >= this.enterMoveThreshold;
    if (wantsSwitch && (tick - this.lastDirChangeTick) >= this.dirSwitchDebounceTicks) {
      this.moveDir = desiredDir;
      this.lastDirChangeTick = tick;
    }

    // Map direction to discrete inputs the existing SlimeBase understands.
    // Note: we intentionally ignore tiny PID sign flips by using moveDir.
    const goRight = this.moveDir === 1 && Math.abs(desiredVx) > 0;
    const goLeft = this.moveDir === -1 && Math.abs(desiredVx) > 0;

    if (slime.isPlayer1) {
      this.input.setKey('KeyD', goRight);
      this.input.setKey('KeyA', goLeft);
      this.input.setKey('KeyW', false);
    } else {
      this.input.setKey('ArrowRight', goRight);
      this.input.setKey('ArrowLeft', goLeft);
      this.input.setKey('ArrowUp', false);
    }

    return this.input;
  }
}



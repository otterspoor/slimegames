import { InputHandler } from './InputHandler.js';

export class GamepadInput {
  private inputHandler: InputHandler;
  private gamepadIndex: number | null = null;
  
  // Deadzone for analog sticks
  private readonly DEADZONE = 0.3;

  constructor(inputHandler: InputHandler) {
    this.inputHandler = inputHandler;
    
    window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
      console.log('Gamepad connected:', e.gamepad.id);
      // Automatically grab the first gamepad connected
      if (this.gamepadIndex === null) {
        this.gamepadIndex = e.gamepad.index;
      }
    });

    window.addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
      console.log('Gamepad disconnected:', e.gamepad.id);
      if (this.gamepadIndex === e.gamepad.index) {
        this.gamepadIndex = null;
        // Clear all inputs from this source
        this.inputHandler.set('gamepad', 'KeyA', false);
        this.inputHandler.set('gamepad', 'KeyD', false);
        this.inputHandler.set('gamepad', 'KeyW', false);
      }
    });
  }

  update(): void {
    const gamepads = navigator.getGamepads();
    
    // If we don't have a locked index, try to find one
    if (this.gamepadIndex === null) {
      for (const gp of gamepads) {
        if (gp) {
          this.gamepadIndex = gp.index;
          break;
        }
      }
    }

    if (this.gamepadIndex === null) return;

    const gp = gamepads[this.gamepadIndex];
    if (!gp) return;

    // --- Movement (Left/Right) ---
    // Map D-Pad (Buttons 14/15) and Left Stick (Axis 0) to KeyA/KeyD
    
    const dpadLeft = gp.buttons[14]?.pressed || false;
    const dpadRight = gp.buttons[15]?.pressed || false;
    const stickLeft = gp.axes[0] < -this.DEADZONE;
    const stickRight = gp.axes[0] > this.DEADZONE;

    const isLeft = dpadLeft || stickLeft;
    const isRight = dpadRight || stickRight;

    this.inputHandler.set('gamepad', 'KeyA', isLeft);
    this.inputHandler.set('gamepad', 'KeyD', isRight);

    // --- Jump (Up/Action) ---
    // Map Face Buttons (0=A, 1=B, 2=X, 3=Y) and D-Pad Up (12) to KeyW
    // Note: Button layout varies, but usually bottom/right face buttons are jump
    
    const btn0 = gp.buttons[0]?.pressed || false; // A / Cross
    const btn1 = gp.buttons[1]?.pressed || false; // B / Circle
    const btn2 = gp.buttons[2]?.pressed || false; // X / Square
    const btn3 = gp.buttons[3]?.pressed || false; // Y / Triangle
    const dpadUp = gp.buttons[12]?.pressed || false;
    
    // Some controllers trigger jump on triggers/shoulders? Let's stick to face buttons
    const isJump = btn0 || btn1 || btn2 || btn3 || dpadUp;

    this.inputHandler.set('gamepad', 'KeyW', isJump);
  }
}


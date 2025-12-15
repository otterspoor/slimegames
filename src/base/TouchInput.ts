import { InputHandler } from './InputHandler.js';

export class TouchInput {
  private inputHandler: InputHandler;
  private container: HTMLDivElement;

  constructor(inputHandler: InputHandler) {
    this.inputHandler = inputHandler;
    this.container = document.createElement('div');
    this.container.id = 'touch-controls';
    
    // Check for touch support
    if (TouchInput.isMobile()) {
      this.initStyles();
      this.createControls();
      document.body.appendChild(this.container);
      this.hide(); // Hidden by default
    }
  }

  // Improved mobile detection
  static isMobile(): boolean {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    return hasTouch && isCoarsePointer;
  }

  show(): void {
    if (this.container) {
      this.container.style.display = 'flex';
    }
  }

  hide(): void {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  private initStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      #touch-controls {
        position: absolute;
        bottom: 20px;
        left: 0;
        width: 100%;
        height: 160px;
        pointer-events: none;
        display: flex;
        justify-content: space-between;
        padding: 0 30px;
        box-sizing: border-box;
        z-index: 100;
        user-select: none;
        -webkit-user-select: none;
      }
      .touch-btn {
        pointer-events: auto;
        width: 85px;
        height: 85px;
        background: rgba(255, 255, 255, 0.2);
        border: 3px solid rgba(255, 255, 255, 0.4);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 32px;
        color: white;
        font-weight: bold;
        touch-action: none;
        -webkit-tap-highlight-color: transparent;
        transition: transform 0.1s, background 0.1s;
        box-shadow: 0 4px 10px rgba(0,0,0,0.2);
      }
      .touch-btn:active, .touch-btn.active {
        background: rgba(255, 255, 255, 0.4);
        transform: scale(0.92);
        border-color: rgba(255, 255, 255, 0.6);
      }
      .d-pad {
        display: flex;
        gap: 20px;
        align-items: flex-end;
        margin-bottom: 10px;
      }
      .action-pad {
        display: flex;
        gap: 20px;
        align-items: flex-end;
        margin-bottom: 10px;
      }
      
      @media (orientation: landscape) and (max-height: 500px) {
         #touch-controls {
            bottom: 10px;
            padding: 0 60px;
         }
         .touch-btn {
            width: 70px;
            height: 70px;
            font-size: 24px;
         }
      }

      /* Prevent long press context menu */
      .touch-btn {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }

      /* Mobile perf: backdrop-filter is very expensive on many devices */
      @media (pointer: coarse) {
        .touch-btn {
          box-shadow: 0 2px 6px rgba(0,0,0,0.18);
        }
      }
    `;
    document.head.appendChild(style);
  }

  private createControls(): void {
    // D-Pad Container (Left/Right)
    const dPad = document.createElement('div');
    dPad.className = 'd-pad';

    // Left Button
    const leftBtn = this.createButton('←', 'KeyA');
    // Right Button
    const rightBtn = this.createButton('→', 'KeyD');

    dPad.appendChild(leftBtn);
    dPad.appendChild(rightBtn);

    // Action Container (Jump)
    const actionPad = document.createElement('div');
    actionPad.className = 'action-pad';

    // Jump Button
    const jumpBtn = this.createButton('Jump', 'KeyW'); 

    actionPad.appendChild(jumpBtn);

    this.container.appendChild(dPad);
    this.container.appendChild(actionPad);
  }

  private createButton(label: string, keyCode: string): HTMLElement {
    const btn = document.createElement('div');
    btn.className = 'touch-btn';
    btn.textContent = label;

    const handleStart = (e: Event) => {
      e.preventDefault();
      btn.classList.add('active');
      this.inputHandler.setKey(keyCode, true);
    };

    const handleEnd = (e: Event) => {
      e.preventDefault();
      btn.classList.remove('active');
      this.inputHandler.setKey(keyCode, false);
    };

    // Touch events
    btn.addEventListener('touchstart', handleStart, { passive: false });
    btn.addEventListener('touchend', handleEnd);
    btn.addEventListener('touchcancel', handleEnd);

    return btn;
  }
}


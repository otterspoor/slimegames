// --- GAME INPUT HANDLER (Unified with Source Tracking) ---
export class InputHandler {
  // Maps key codes to a Set of active input sources (e.g. 'keyboard', 'touch', 'gamepad')
  private activeInputs: Map<string, Set<string>> = new Map();

  constructor() {
    window.addEventListener('keydown', (e: KeyboardEvent) => this.set('keyboard', e.code, true));
    window.addEventListener('keyup', (e: KeyboardEvent) => this.set('keyboard', e.code, false));
  }

  isDown(code: string): boolean {
    const sources = this.activeInputs.get(code);
    return !!(sources && sources.size > 0);
  }

  // Legacy support for TouchInput (defaults to 'touch')
  setKey(code: string, isDown: boolean): void {
    this.set('touch', code, isDown);
  }

  // Unified setter for any input source
  set(source: string, code: string, isDown: boolean): void {
    if (isDown) {
      if (!this.activeInputs.has(code)) {
        this.activeInputs.set(code, new Set());
      }
      this.activeInputs.get(code)!.add(source);
    } else {
      const sources = this.activeInputs.get(code);
      if (sources) {
        sources.delete(source);
        if (sources.size === 0) {
          this.activeInputs.delete(code);
        }
      }
    }
  }
}

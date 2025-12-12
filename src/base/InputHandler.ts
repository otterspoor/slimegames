// --- GAME INPUT HANDLER (Unified) ---
export class InputHandler {
  private keys: Record<string, boolean> = {};

  constructor() {
    window.addEventListener('keydown', (e: KeyboardEvent) => this.keys[e.code] = true);
    window.addEventListener('keyup', (e: KeyboardEvent) => this.keys[e.code] = false);
  }

  isDown(code: string): boolean {
    return !!this.keys[code];
  }
}



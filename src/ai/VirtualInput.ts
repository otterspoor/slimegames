import type { InputSource } from '../base/index.js';

export class VirtualInput implements InputSource {
  private keys: Record<string, boolean> = {};

  setKey(code: string, down: boolean): void {
    this.keys[code] = down;
  }

  clear(): void {
    this.keys = {};
  }

  isDown(code: string): boolean {
    return !!this.keys[code];
  }
}



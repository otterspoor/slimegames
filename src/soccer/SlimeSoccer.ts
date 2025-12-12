import * as Base from '../base/index.js';

// --- SLIME SOCCER (Full Court Boundaries) ---
export class SlimeSoccer extends Base.SlimeBase {
  constructor(isPlayer1: boolean) {
    super(isPlayer1, isPlayer1 ? '#e74c3c' : '#f1c40f');
  }
  
  applyBoundaries(): void {
    const r = Base.CONFIG.slimeRadius; 
    if (this.x - r < 0) this.x = r;
    if (this.x + r > Base.CONFIG.internalWidth) this.x = Base.CONFIG.internalWidth - r;
  }
}



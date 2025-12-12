import * as Base from '../base/index.js';

// --- SLIME VOLLEYBALL (Half Court / Net Boundaries) ---
export class SlimeVolleyball extends Base.SlimeBase {
  constructor(isPlayer1: boolean) {
    super(isPlayer1, isPlayer1 ? '#e74c3c' : '#2ecc71');
  }

  applyBoundaries(): void {
    const r = Base.CONFIG.slimeRadius; 
    const netX = Base.CONFIG.internalWidth / 2;
    const netW = Base.CONFIG.VOLLEYBALL_NET_W / 2;
    
    if (this.isPlayer1) {
      // Must stay left of the net
      if (this.x + r > netX - netW) this.x = netX - netW - r;
      if (this.x - r < 0) this.x = r; // Left wall
    } else {
      // Must stay right of the net
      if (this.x - r < netX + netW) this.x = netX + netW + r;
      if (this.x + r > Base.CONFIG.internalWidth) this.x = Base.CONFIG.internalWidth - r; // Right wall
    }
  }
}



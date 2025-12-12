import { CONFIG } from './config.js';
import { InputHandler } from './InputHandler.js';
import * as Soccer from '../soccer/index.js';
import * as Volleyball from '../volleyball/index.js';
import { SlimeBase } from './SlimeBase.js';
import { BallBase, GameInterface } from './BallBase.js';
import * as AI from '../ai/index.js';

type GameMode = 'SOCCER' | 'VOLLEYBALL';

interface GameClassSet {
  SlimeClass: new (isPlayer1: boolean) => SlimeBase;
  BallClass: new (game: GameInterface) => BallBase;
  name: string;
  emoji: string;
}

// --- MAIN GAME CLASS (Orchestrator) ---
export class Game implements GameInterface {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private input: InputHandler;
  
  private p1: SlimeBase | null = null;
  private p2: SlimeBase | null = null;
  private ball: BallBase | null = null; 
  
  private gameMode: GameMode | null = null; 
  private score1: number = 0;
  private score2: number = 0;
  private server: number = 1; 
  private running: boolean = false; 
  private modal: HTMLElement;
  private selectionModal: HTMLElement;
  private winnerText: HTMLElement;
  private singlePlayerToggle: HTMLInputElement | null = null;
  private singlePlayerEnabled: boolean = false;
  private p2AI: AI.AIBase | null = null;
  
  private lastTime: number = 0;
  private accumulator: number = 0;
  private timeStep: number = 1000 / 60;
  
  // Lookup for Instantiation with metadata
  private readonly GAME_CLASSES: Record<GameMode, GameClassSet> = {
    'SOCCER': {
      SlimeClass: Soccer.SlimeSoccer,
      BallClass: Soccer.BallSoccer,
      name: 'Slime Soccer',
      emoji: '⚽'
    },
    'VOLLEYBALL': {
      SlimeClass: Volleyball.SlimeVolleyball,
      BallClass: Volleyball.BallVolleyball,
      name: 'Slime Volleyball',
      emoji: '🏐'
    }
  };

  constructor() {
    const canvasElement = document.getElementById('gameCanvas');
    if (!canvasElement || !(canvasElement instanceof HTMLCanvasElement)) {
      throw new Error('Canvas element not found');
    }
    this.canvas = canvasElement;
    
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get 2d context');
    }
    this.ctx = context;
    
    this.input = new InputHandler();
    
    const modalElement = document.getElementById('gameOverModal');
    const selectionModalElement = document.getElementById('selectionModal');
    const winnerTextElement = document.getElementById('winnerText');
    
    if (!modalElement || !selectionModalElement || !winnerTextElement) {
      throw new Error('Required DOM elements not found');
    }
    
    this.modal = modalElement;
    this.selectionModal = selectionModalElement;
    this.winnerText = winnerTextElement;

    // Optional: single-player toggle in the selection modal
    const spToggle = document.getElementById('singlePlayerToggle');
    if (spToggle instanceof HTMLInputElement) {
      this.singlePlayerToggle = spToggle;
    }
    
    const restartBtn = document.getElementById('restartBtn');
    const gameButtonsContainer = document.getElementById('gameButtonsContainer');
    
    if (!restartBtn || !gameButtonsContainer) {
      throw new Error('Required DOM elements not found');
    }
    
    restartBtn.addEventListener('click', () => this.selectGame());
    
    // Dynamically create game selection buttons
    this.createGameButtons(gameButtonsContainer);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    
    this.startLoop();
  }

  private createGameButtons(container: HTMLElement): void {
    // Clear any existing buttons
    container.innerHTML = '';
    
    // Create buttons for each game mode
    Object.entries(this.GAME_CLASSES).forEach(([mode, gameDef]) => {
      const button = document.createElement('button');
      button.id = `select${mode}`;
      button.textContent = `${gameDef.emoji} ${gameDef.name}`;
      button.addEventListener('click', () => this.startGame(mode as GameMode));
      container.appendChild(button);
    });
  }

  selectGame(): void {
    this.running = false;
    this.modal.style.display = 'none';
    this.selectionModal.style.display = 'block';
  }

  startGame(mode: GameMode): void {
    this.gameMode = mode;
    const classes = this.GAME_CLASSES[mode];
    
    this.p1 = new classes.SlimeClass(true);
    this.p2 = new classes.SlimeClass(false);
    this.ball = new classes.BallClass(this); 

    // Read single-player setting at game start
    this.singlePlayerEnabled = !!this.singlePlayerToggle?.checked;
    if (!this.singlePlayerEnabled) {
      this.p2AI = null;
    } else {
      // Mode-specific AI
      if (mode === 'SOCCER') this.p2AI = new Soccer.SoccerAI();
      else if (mode === 'VOLLEYBALL') this.p2AI = new Volleyball.VolleyballAI();
      else this.p2AI = new AI.AIPIDChase();
    }
    
    this.score1 = 0;
    this.score2 = 0;
    this.server = 1;
    this.selectionModal.style.display = 'none';
    this.running = true;
    
    this.resetRound();
  }

  resize(): void {
    const targetRatio = CONFIG.internalWidth / CONFIG.internalHeight;
    const windowRatio = window.innerWidth / window.innerHeight;
    let finalWidth: number, finalHeight: number;
    if (windowRatio > targetRatio) {
      finalHeight = window.innerHeight * 0.9;
      finalWidth = finalHeight * targetRatio;
    } else {
      finalWidth = window.innerWidth * 0.95;
      finalHeight = finalWidth / targetRatio;
    }
    this.canvas.width = finalWidth;
    this.canvas.height = finalHeight;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(finalWidth / CONFIG.internalWidth, finalHeight / CONFIG.internalHeight);
  }

  scorePoint(scoringPlayer: number): void {
    if (scoringPlayer === 1) this.score1++; else this.score2++;
    
    if (this.score1 >= CONFIG.winningScore || this.score2 >= CONFIG.winningScore) {
      this.endGame();
    } else {
      if (this.gameMode === 'VOLLEYBALL') this.server = scoringPlayer;
      this.resetRound();
    }
  }

  getTotalScore(): number {
    return this.score1 + this.score2;
  }

  resetRound(): void {
    if (!this.p1 || !this.p2 || !this.ball) return;
    
    this.p1.reset();
    this.p2.reset();
    
    let serverSlime: SlimeBase | null = null;
    if (this.gameMode === 'VOLLEYBALL') {
      serverSlime = this.server === 1 ? this.p1 : this.p2;
    }
    
    this.ball.reset(serverSlime);
  }

  endGame(): void {
    this.running = false;
    this.winnerText.textContent = this.score1 > this.score2 ? "Player 1 Wins!" : "Player 2 Wins!";
    this.modal.style.display = 'block';
  }

  update(): void {
    if (!this.running || !this.p1 || !this.p2 || !this.ball) return;
    this.p1.update(this.input);
    const p2Input = this.p2AI ? this.p2AI.getInput(this.p2, this.ball, this.p1, this.input) : this.input;
    this.p2.update(p2Input);
    this.ball.update(this.p1, this.p2);
  }

  draw(): void {
    // Clear background
    this.ctx.fillStyle = '#87ceeb';
    this.ctx.fillRect(0, 0, CONFIG.internalWidth, CONFIG.internalHeight);
    
    const groundY = CONFIG.internalHeight - CONFIG.groundHeight;
    this.ctx.fillStyle = '#27ae60'; 
    this.ctx.fillRect(0, groundY, CONFIG.internalWidth, CONFIG.groundHeight);
    if (this.running && this.gameMode) {
      
      if (this.gameMode === 'SOCCER') this.drawSoccerGoals(groundY);
      if (this.gameMode === 'VOLLEYBALL') this.drawVolleyballNet(groundY);
      
      this.ctx.fillStyle = '#000';
      this.ctx.font = 'bold 30px Inter';
      this.ctx.fillText(`P1: ${this.score1}`, 60, 50);
      this.ctx.fillText(`P2: ${this.score2}`, CONFIG.internalWidth - 130, 50);
      if (this.p1 && this.p2 && this.ball) {
        this.p1.draw(this.ctx, this.ball);
        this.p2.draw(this.ctx, this.ball);
        this.ball.draw(this.ctx);
      }
    }
  }
  
  drawSoccerGoals(groundY: number): void {
    const goalH = CONFIG.SOCCER_GOAL_H;
    const crossR = CONFIG.SOCCER_CROSSBAR_R;
    
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    // Left Goal Post/Net
    this.ctx.fillRect(0, groundY - goalH, 20, goalH);
    this.ctx.fillStyle = '#ecf0f1';
    this.ctx.beginPath();
    this.ctx.arc(0, groundY - goalH, crossR, 0, Math.PI*2);
    this.ctx.fill();
    this.ctx.stroke();
    // Right Goal Post/Net
    this.ctx.fillRect(CONFIG.internalWidth - 20, groundY - goalH, 20, goalH);
    this.ctx.beginPath();
    this.ctx.arc(CONFIG.internalWidth, groundY - goalH, crossR, 0, Math.PI*2);
    this.ctx.fill();
    this.ctx.stroke();
  }
  
  drawVolleyballNet(groundY: number): void {
    const netW = CONFIG.VOLLEYBALL_NET_W;
    const netH = CONFIG.VOLLEYBALL_NET_H;
    
    this.ctx.fillStyle = '#fff';
    const netX = (CONFIG.internalWidth - netW) / 2;
    const netY = groundY - netH;
    this.ctx.fillRect(netX, netY, netW, netH);
    
    this.ctx.strokeStyle = '#000';
    this.ctx.strokeRect(netX, netY, netW, netH);
  }

  startLoop(): void {
    const loop = (timestamp: number) => {
      let deltaTime = timestamp - this.lastTime;
      this.lastTime = timestamp;
      if (deltaTime > 100) deltaTime = 100;
      this.accumulator += deltaTime;
      while (this.accumulator >= this.timeStep) {
        this.update();
        this.accumulator -= this.timeStep;
      }
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

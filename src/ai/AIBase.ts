import type * as Base from '../base/index.js';

export abstract class AIBase {
  abstract getInput(
    slime: Base.SlimeBase,
    ball: Base.BallBase,
    opponent: Base.SlimeBase,
    opponentInput: Base.InputSource
  ): Base.InputSource;
}



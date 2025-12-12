import type * as Base from '../base/index.js';

export type MoveAction = 'LEFT' | 'RIGHT' | 'NONE';

export interface PlayerPlan {
  action: MoveAction;
  jumpOnStep0: boolean;
  grabOrThrowOnStep0: boolean;
}

export function planFromInput(input: Base.InputSource, isPlayer1: boolean): PlayerPlan {
  const left = isPlayer1 ? input.isDown('KeyA') : input.isDown('ArrowLeft');
  const right = isPlayer1 ? input.isDown('KeyD') : input.isDown('ArrowRight');
  const jump = isPlayer1 ? input.isDown('KeyW') : input.isDown('ArrowUp');
  const grabOrThrow = isPlayer1 ? input.isDown('KeyS') : input.isDown('ArrowDown');

  let action: MoveAction = 'NONE';
  if (left && !right) action = 'LEFT';
  else if (right && !left) action = 'RIGHT';

  return { action, jumpOnStep0: jump, grabOrThrowOnStep0: grabOrThrow };
}

class AlwaysUpInput implements Base.InputSource {
  constructor(private readonly codesDown: ReadonlySet<string>) {}
  isDown(code: string): boolean {
    return this.codesDown.has(code);
  }
}

export function buildP1Input(plan: Pick<PlayerPlan, 'action' | 'jumpOnStep0' | 'grabOrThrowOnStep0'>): Base.InputSource {
  const down = new Set<string>();
  if (plan.action === 'LEFT') down.add('KeyA');
  if (plan.action === 'RIGHT') down.add('KeyD');
  if (plan.jumpOnStep0) down.add('KeyW');
  if (plan.grabOrThrowOnStep0) down.add('KeyS');
  return new AlwaysUpInput(down);
}

export function buildP2Input(plan: Pick<PlayerPlan, 'action' | 'jumpOnStep0' | 'grabOrThrowOnStep0'>): Base.InputSource {
  const down = new Set<string>();
  if (plan.action === 'LEFT') down.add('ArrowLeft');
  if (plan.action === 'RIGHT') down.add('ArrowRight');
  if (plan.jumpOnStep0) down.add('ArrowUp');
  if (plan.grabOrThrowOnStep0) down.add('ArrowDown');
  return new AlwaysUpInput(down);
}



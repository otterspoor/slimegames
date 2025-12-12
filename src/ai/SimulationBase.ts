export type SimulationOutcome<TMeta = undefined> =
  | { verdict: 'none' }
  | { verdict: 'win' | 'loss'; step: number; meta: TMeta };

export abstract class SimulationBase<TState, TMeta = undefined> {
  // Advance the simulation by one tick (same timestep as the game update loop).
  protected abstract step(state: Readonly<TState>): TState;

  // Return a win/loss outcome if the simulation should stop early.
  // Each game-specific simulator defines what "win" and "loss" mean.
  protected abstract terminal(state: Readonly<TState>, step: number): SimulationOutcome<TMeta> | null;

  simulate(initial: Readonly<TState>, steps: number): SimulationOutcome<TMeta> {
    let state: TState = initial as TState;
    for (let i = 0; i < steps; i++) {
      state = this.step(state);
      const term = this.terminal(state, i + 1);
      if (term) return term;
    }
    // If we never hit a terminal condition, it's just "none".
    // We still return the standardized outcome shape.
    return { verdict: 'none' } as SimulationOutcome<TMeta>;
  }
}



/** Shared types + on-chain enums. */

/** Project lifecycle states (the on-chain `ProjectState` discriminant order). */
export enum ProjectState {
  Fundraising = 'Fundraising',
  HoldPeriod1 = 'HoldPeriod1',
  HoldPeriod2 = 'HoldPeriod2',
  Success = 'Success',
  Failed1 = 'Failed1',
  Failed2 = 'Failed2',
  Cancelled = 'Cancelled',
}

/** Index → name, matching the on-chain u8 discriminant. */
export const STATE_NAMES: readonly ProjectState[] = [
  ProjectState.Fundraising,
  ProjectState.HoldPeriod1,
  ProjectState.HoldPeriod2,
  ProjectState.Success,
  ProjectState.Failed1,
  ProjectState.Failed2,
  ProjectState.Cancelled,
];

/** Whether a state is a terminal failure (a real haircut, refund path open). */
export function isFailure(state: ProjectState): boolean {
  return state === ProjectState.Failed1 || state === ProjectState.Failed2;
}

/** Whether the project's token is live on the open Raydium market. */
export function isTradable(state: ProjectState): boolean {
  return (
    state === ProjectState.HoldPeriod1 ||
    state === ProjectState.HoldPeriod2 ||
    state === ProjectState.Success
  );
}

/** Access mode chosen at create_project (borsh u8 discriminant). */
export enum AccessMode {
  Public = 0,
  Private = 1,
  Hybrid = 2,
}

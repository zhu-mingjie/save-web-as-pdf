export interface PagePreparationState {
  scrollX: number;
  scrollY: number;
  styleElement: HTMLStyleElement;
}

let activeState: PagePreparationState | null = null;

export function setPageState(state: PagePreparationState): void {
  activeState = state;
}

export function takePageState(): PagePreparationState | null {
  const state = activeState;
  activeState = null;
  return state;
}

export function hasPageState(): boolean {
  return activeState !== null;
}

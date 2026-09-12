export interface TemporaryStyleChange {
  element: HTMLElement;
  property: string;
  originalValue: string;
  originalPriority: string;
  appliedValue: string;
  appliedPriority: string;
}

export interface TemporaryAttributeChange {
  element: Element;
  name: string;
  originalValue: string | null;
  appliedValue: string;
}

export interface PagePreparationState {
  scrollX: number;
  scrollY: number;
  styleElement: HTMLStyleElement;
  styleChanges: TemporaryStyleChange[];
  attributeChanges: TemporaryAttributeChange[];
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

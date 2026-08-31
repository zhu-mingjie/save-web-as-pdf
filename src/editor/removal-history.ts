export class RemovalHistory {
  private undoStack: HTMLElement[] = [];
  private redoStack: HTMLElement[] = [];

  constructor(private readonly removedClass: string) {}

  remove(element: HTMLElement): void {
    if (element.classList.contains(this.removedClass)) return;
    element.classList.add(this.removedClass);
    this.undoStack.push(element);
    this.redoStack = [];
  }

  undo(): void {
    const element = this.undoStack.pop();
    if (!element) return;
    element.classList.remove(this.removedClass);
    this.redoStack.push(element);
  }

  redo(): void {
    const element = this.redoStack.pop();
    if (!element) return;
    element.classList.add(this.removedClass);
    this.undoStack.push(element);
  }

  restoreAll(): void {
    for (const element of [...this.undoStack, ...this.redoStack]) element.classList.remove(this.removedClass);
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get count(): number {
    return this.undoStack.length;
  }
}

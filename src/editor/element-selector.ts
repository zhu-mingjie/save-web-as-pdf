export class ElementSelector {
  private current: HTMLElement | null = null;

  constructor(
    private readonly overlay: HTMLElement,
    private readonly extensionHost: HTMLElement,
    private readonly onSelect: (element: HTMLElement) => void
  ) {}

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.composedPath().includes(this.extensionHost)) {
      this.clear();
      return;
    }
    const target = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement);
    if (!target || target === document.body || target === document.documentElement || target === this.extensionHost) {
      this.clear();
      return;
    }
    if (this.extensionHost.contains(target)) return;
    this.current = target;
    this.updateOverlay(target);
  };

  private readonly onScroll = (): void => {
    if (this.current?.isConnected) this.updateOverlay(this.current);
    else this.clear();
  };

  private readonly onClick = (event: MouseEvent): void => {
    if (!this.current || event.composedPath().includes(this.extensionHost)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const selected = this.current;
    this.clear();
    this.onSelect(selected);
  };

  start(): void {
    document.addEventListener("pointermove", this.onPointerMove, true);
    document.addEventListener("click", this.onClick, true);
    window.addEventListener("scroll", this.onScroll, true);
    window.addEventListener("resize", this.onScroll, true);
  }

  stop(): void {
    document.removeEventListener("pointermove", this.onPointerMove, true);
    document.removeEventListener("click", this.onClick, true);
    window.removeEventListener("scroll", this.onScroll, true);
    window.removeEventListener("resize", this.onScroll, true);
    this.clear();
  }

  clear(): void {
    this.current = null;
    this.overlay.hidden = true;
  }

  private updateOverlay(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      this.clear();
      return;
    }
    Object.assign(this.overlay.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
    this.overlay.hidden = false;
  }
}

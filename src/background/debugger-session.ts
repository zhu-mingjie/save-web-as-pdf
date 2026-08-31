export class DebuggerSession {
  readonly target: chrome.debugger.Debuggee;
  private attached = false;

  constructor(tabId: number) {
    this.target = { tabId };
  }

  async attach(): Promise<void> {
    if (this.attached) return;
    await chrome.debugger.attach(this.target, "1.3");
    this.attached = true;
  }

  async send<T>(method: string, params?: object): Promise<T> {
    if (!this.attached) throw new Error("The debugger is not attached.");
    return (await chrome.debugger.sendCommand(this.target, method, params)) as T;
  }

  async detach(): Promise<void> {
    if (!this.attached) return;
    this.attached = false;
    try {
      await chrome.debugger.detach(this.target);
    } catch {
      // The tab may have closed or Chrome may already have detached the session.
    }
  }
}

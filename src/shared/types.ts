export interface SourcePageMetadata {
  title: string;
  url: string;
  hostname: string;
  filename: string;
}

export interface PdfRecord {
  id: string;
  blob: Blob;
  metadata: SourcePageMetadata;
  createdAt: number;
}

export interface ExportSession {
  operationId: string;
  status: "running" | "canceling";
  startedAt: number;
}

export interface PageMetrics {
  width: number;
  height: number;
}

export type CaptureMode = "full-page" | "zhihu-answer" | "loaded-snapshot";

export type PreparationStopReason =
  | "target-bottom"
  | "loaded-boundary"
  | "scroll-limit"
  | "height-limit"
  | "time-limit";

export interface PreparationDiagnostics {
  captureMode: CaptureMode;
  stopReason: PreparationStopReason;
  viewport: PageMetrics;
  initial: PageMetrics;
  prepared: PageMetrics;
  stableSamples: number;
  observedGrowth: number;
  viewportRulesFrozen: number;
  inaccessibleStyleSheets: number;
  hiddenBranches: number;
  resourceWaitTimedOut: boolean;
}

export interface PrepareResult {
  width: number;
  height: number;
  title: string;
  url: string;
  captureMode: CaptureMode;
  captureLabel: string;
  diagnostics: PreparationDiagnostics;
}

export type ExportMode = "full" | "edit";

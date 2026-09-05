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

export interface PageMetrics {
  width: number;
  height: number;
}

export interface PrepareResult {
  width: number;
  height: number;
  title: string;
  url: string;
}

export type ExportMode = "full" | "edit";

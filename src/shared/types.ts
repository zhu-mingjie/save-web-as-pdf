export interface PdfRecord {
  id: string;
  blob: Blob;
  filename: string;
  sourceUrl: string;
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

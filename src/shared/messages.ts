import type { PrepareResult, SourcePageMetadata } from "./types";

export type RuntimeRequest =
  | { type: "START_EXPORT"; tabId: number; metadata: SourcePageMetadata }
  | { type: "START_EDITOR"; tabId: number; metadata: SourcePageMetadata }
  | { type: "EDIT_SAVE_REQUEST"; metadata: SourcePageMetadata }
  | { type: "PREPARE_PAGE" }
  | { type: "CLEANUP_PAGE" }
  | { type: "EDITOR_START"; metadata: SourcePageMetadata }
  | { type: "EDITOR_FINISH" };

export interface SuccessResponse<T = undefined> {
  ok: true;
  data?: T;
}

export interface ErrorResponse {
  ok: false;
  error: string;
}

export type MessageResponse<T = undefined> = SuccessResponse<T> | ErrorResponse;
export type PrepareResponse = MessageResponse<PrepareResult>;

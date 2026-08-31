import type { PrepareResult } from "./types";

export type RuntimeRequest =
  | { type: "START_EXPORT"; tabId: number }
  | { type: "START_EDITOR"; tabId: number }
  | { type: "EDIT_SAVE_REQUEST" }
  | { type: "PREPARE_PAGE" }
  | { type: "CLEANUP_PAGE" }
  | { type: "EDITOR_START" }
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

import type { VscpDocument } from "./schema";

export type ExtensionToWebviewMessage = {
  type: "update";
  document: VscpDocument;
};

export type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "edit"; document: VscpDocument }
  | { type: "openFileLink"; path: string; match?: string };

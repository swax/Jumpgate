import type { FileLink, VscpDocument } from "./schema";

export type ExtensionToWebviewMessage =
  | { type: "update"; document: VscpDocument }
  | { type: "fileLinkResult"; targetId: string; targetKind: "node" | "edge"; fileLink?: FileLink };

export type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "edit"; document: VscpDocument }
  | { type: "openFileLink"; path: string; match?: string; preview?: boolean }
  | { type: "editFileLink"; targetId: string; targetKind: "node" | "edge"; currentPath?: string; currentMatch?: string }
  | { type: "viewSource" };

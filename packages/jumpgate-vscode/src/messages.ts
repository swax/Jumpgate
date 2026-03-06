import type { FileLink, JgDocument } from "jumpgate/schema";

export type ExtensionToWebviewMessage =
  | { type: "update"; document: JgDocument }
  | {
      type: "fileLinkResult";
      targetId: string;
      targetKind: "node" | "edge";
      fileLink?: FileLink;
    };

export type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "edit"; document: JgDocument }
  | { type: "openFileLink"; path: string; match?: string; preview?: boolean }
  | {
      type: "editFileLink";
      targetId: string;
      targetKind: "node" | "edge";
      currentPath?: string;
      currentMatch?: string;
    }
  | { type: "viewSource" };

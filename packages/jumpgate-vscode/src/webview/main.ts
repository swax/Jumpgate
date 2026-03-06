import { createJumpgateEditor } from "jumpgate";
import type { ExtensionToWebviewMessage } from "../messages";

const vscode = acquireVsCodeApi();

async function main(): Promise<void> {
  const container = document.getElementById("editor-container") as HTMLDivElement;

  const editor = await createJumpgateEditor(container, {
    onDocumentChanged: (doc) => {
      vscode.postMessage({ type: "edit", document: doc });
    },
    onOpenFileLink: (path, match, preview) => {
      vscode.postMessage({ type: "openFileLink", path, match, preview });
    },
    onEditFileLink: (targetId, targetKind, currentPath, currentMatch) => {
      vscode.postMessage({
        type: "editFileLink",
        targetId,
        targetKind,
        currentPath,
        currentMatch,
      });
    },
    onViewSource: () => {
      vscode.postMessage({ type: "viewSource" });
    },
  });

  // Handle messages from the extension
  window.addEventListener("message", (event) => {
    const msg = event.data as ExtensionToWebviewMessage;
    switch (msg.type) {
      case "update":
        editor.setDocument(msg.document);
        break;
      case "fileLinkResult":
        editor.setFileLink(msg.targetId, msg.targetKind, msg.fileLink);
        break;
    }
  });

  // Tell extension we're ready
  vscode.postMessage({ type: "ready" });
}

main();

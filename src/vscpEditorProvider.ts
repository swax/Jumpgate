import * as vscode from "vscode";
import { documentSchema } from "./schema";
import type {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from "./messages";

export class VscpEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "perspective.vscpPreview";

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      VscpEditorProvider.viewType,
      new VscpEditorProvider(context),
      {
        webviewOptions: { retainContextWhenHidden: true },
      }
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const webview = webviewPanel.webview;

    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "dist"),
      ],
    };

    webview.html = this.getHtmlForWebview(webview);

    let isApplyingEdit = false;

    const sendDocument = () => {
      const text = document.getText();
      try {
        const json: unknown = JSON.parse(text);
        const result = documentSchema.safeParse(json);
        if (result.success) {
          const msg: ExtensionToWebviewMessage = {
            type: "update",
            document: result.data,
          };
          webview.postMessage(msg);
        }
      } catch {
        // Ignore parse errors — webview keeps last valid state
      }
    };

    const messageSubscription = webview.onDidReceiveMessage(
      async (msg: WebviewToExtensionMessage) => {
        switch (msg.type) {
          case "ready":
            sendDocument();
            break;
          case "edit": {
            const newContent = JSON.stringify(msg.document, null, 2) + "\n";
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
              document.uri,
              new vscode.Range(0, 0, document.lineCount, 0),
              newContent
            );
            isApplyingEdit = true;
            await vscode.workspace.applyEdit(edit);
            isApplyingEdit = false;
            break;
          }
          case "openFileLink": {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) break;
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, msg.path);
            try {
              const fileDoc = await vscode.workspace.openTextDocument(fileUri);
              let selection: vscode.Range | undefined;
              if (msg.match) {
                const text = fileDoc.getText();
                const idx = text.indexOf(msg.match);
                if (idx >= 0) {
                  const startPos = fileDoc.positionAt(idx);
                  const endPos = fileDoc.positionAt(idx + msg.match.length);
                  selection = new vscode.Range(startPos, endPos);
                }
              }
              // If another editor group exists, open there; otherwise same group
              const panelColumn = webviewPanel.viewColumn;
              const otherGroup = vscode.window.tabGroups.all.find(
                (g) => g.viewColumn !== panelColumn
              );
              await vscode.window.showTextDocument(fileDoc, {
                selection,
                preview: true,
                viewColumn: otherGroup?.viewColumn,
              });
            } catch {
              vscode.window.showErrorMessage(`Could not open file: ${msg.path}`);
            }
            break;
          }
        }
      }
    );

    const changeDocumentSubscription =
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (
          e.document.uri.toString() === document.uri.toString() &&
          !isApplyingEdit
        ) {
          sendDocument();
        }
      });

    webviewPanel.onDidDispose(() => {
      messageSubscription.dispose();
      changeDocumentSubscription.dispose();
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js")
    );
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval'; style-src 'unsafe-inline';">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--vscode-editor-background);
    }
    body.vscode-dark, body.vscode-high-contrast {
      color-scheme: dark;
    }
    body.vscode-light, body.vscode-high-contrast-light {
      color-scheme: light;
    }
    #canvas-container {
      width: 100%;
      height: 100%;
    }
    .toolbar-btn {
      position: fixed;
      top: 8px;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 4px;
      background: var(--vscode-dropdown-background, #3a3d41);
      color: var(--vscode-dropdown-foreground, #cccccc);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      padding: 4px;
    }
    .toolbar-btn:hover {
      background: var(--vscode-dropdown-background, #45494e);
    }
    .toolbar-btn svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }
    #lock-btn {
      right: 8px;
    }
    #snap-btn {
      right: 48px;
    }
    #edge-btn {
      right: 88px;
    }
    #sidebar {
      position: fixed;
      top: 48px;
      right: 8px;
      z-index: 10;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .color-field {
      width: 32px;
      height: 32px;
      padding: 0;
      border: 1px solid #000;
      border-radius: 4px;
      background: none;
      cursor: pointer;
      -webkit-appearance: none;
      appearance: none;
    }
    .color-field::-webkit-color-swatch-wrapper {
      padding: 0;
    }
    .color-field::-webkit-color-swatch {
      border: none;
    }
    .color-field::-moz-color-swatch {
      border: none;
    }
    #text-color-wrapper {
      position: relative;
      width: 32px;
      height: 32px;
      border: 1px solid #000;
      border-radius: 4px;
      cursor: pointer;
      overflow: hidden;
    }
    #text-color-wrapper #text-color {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }
    #text-color-label {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 16px;
      pointer-events: none;
    }
    #shape-select {
      width: 32px;
      height: 32px;
      padding: 0;
      border: 1px solid #000;
      border-radius: 4px;
      background: var(--vscode-dropdown-background, #3a3d41);
      color: var(--vscode-dropdown-foreground, #cccccc);
      cursor: pointer;
      font-size: 16px;
      text-align: center;
      text-align-last: center;
      -webkit-appearance: none;
      appearance: none;
    }
    #shape-select option {
      background: var(--vscode-dropdown-background, #3a3d41);
      color: var(--vscode-dropdown-foreground, #cccccc);
      text-align: center;
    }
    #rotate-btn {
      width: 32px;
      height: 32px;
      padding: 0;
      border: 1px solid #000;
      border-radius: 4px;
      background: var(--vscode-dropdown-background, #3a3d41);
      color: var(--vscode-dropdown-foreground, #cccccc);
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #rotate-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #45494e);
    }
    #edge-mode-status {
      display: none;
      position: fixed;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      padding: 4px 12px;
      border-radius: 4px;
      background: var(--vscode-editorWidget-background, #252526);
      color: var(--vscode-editorWidget-foreground, #cccccc);
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: 12px;
      z-index: 20;
      pointer-events: none;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div id="canvas-container"></div>
  <button id="edge-btn" class="toolbar-btn" title="Add Edge"></button>
  <button id="snap-btn" class="toolbar-btn" title="Snap to grid (on)"></button>
  <button id="lock-btn" class="toolbar-btn" title="Lock editing"></button>
  <div id="edge-mode-status"></div>
  <div id="sidebar">
    <input type="color" id="fill-color" class="color-field" title="Node color">
    <div id="text-color-wrapper" title="Label color">
      <span id="text-color-label">T</span>
      <input type="color" id="text-color" class="color-field">
    </div>
    <select id="shape-select" title="Shape">
      <option value="">▭</option>
      <option value="rounded-rectangle">▢</option>
      <option value="ellipse">⬭</option>
      <option value="diamond">◇</option>
      <option value="parallelogram">▱</option>
      <option value="trapezoid">⏢</option>
      <option value="triangle">△</option>
      <option value="cylinder">⌭</option>
      <option value="pill">⊖</option>
      <option value="half-ellipse">⌓</option>
      <option value="half-pill">◗</option>
      <option value="document">⎵</option>
      <option value="text">T</option>
    </select>
    <button id="rotate-btn" title="Rotate 90°">⟳</button>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

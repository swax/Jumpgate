import * as vscode from "vscode";
import { documentSchema } from "./schema";
import type { FileLink } from "./schema";
import type {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from "./messages";

export class JgEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "jumpgate.preview";

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      JgEditorProvider.viewType,
      new JgEditorProvider(context),
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
          case "viewSource": {
            await vscode.commands.executeCommand("vscode.openWith", document.uri, "default");
            break;
          }
          case "openFileLink": {
            if (/^https?:\/\//.test(msg.path)) {
              vscode.env.openExternal(vscode.Uri.parse(msg.path));
              break;
            }
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
              const panelColumn = webviewPanel.viewColumn;
              const backgroundOpen = msg.preview === false;
              // Find another editor group, preferring the leftmost one
              const otherGroups = vscode.window.tabGroups.all
                .filter((g) => g.viewColumn !== panelColumn)
                .sort((a, b) => a.viewColumn - b.viewColumn);
              const viewColumn = otherGroups[0]?.viewColumn
                ?? (backgroundOpen ? vscode.ViewColumn.Beside : undefined);
              await vscode.window.showTextDocument(fileDoc, {
                selection,
                preview: msg.preview ?? true,
                preserveFocus: backgroundOpen,
                viewColumn,
              });
            } catch {
              vscode.window.showErrorMessage(`Could not open file: ${msg.path}`);
            }
            break;
          }
          case "editFileLink": {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) break;

            const files = await vscode.workspace.findFiles("**/*", "**/node_modules/**");
            const relativePaths = files
              .map((f) => vscode.workspace.asRelativePath(f, false))
              .sort((a, b) => a.localeCompare(b));

            interface FileLinkItem extends vscode.QuickPickItem {
              action?: "remove" | "url";
              filePath?: string;
            }

            const items: FileLinkItem[] = [];

            if (msg.currentPath) {
              items.push({ label: "$(trash) Remove File Link", action: "remove" });
            }
            items.push({ label: "$(link) Enter URL...", action: "url" });
            items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });

            for (const p of relativePaths) {
              items.push({ label: p, filePath: p });
            }

            const picked = await vscode.window.showQuickPick(items, {
              placeHolder: "Select a file or enter a URL",
              matchOnDescription: true,
            });

            if (!picked) break; // user cancelled

            let fileLink: FileLink | undefined;

            if (picked.action === "remove") {
              // Send result with no fileLink to remove it
              fileLink = undefined;
            } else if (picked.action === "url") {
              const url = await vscode.window.showInputBox({
                prompt: "Enter URL",
                placeHolder: "https://...",
                value: msg.currentPath && /^https?:\/\//.test(msg.currentPath) ? msg.currentPath : undefined,
              });
              if (url === undefined) break; // user cancelled
              if (url) {
                fileLink = { path: url };
              } else {
                break; // empty input
              }
            } else if (picked.filePath) {
              const prefill = (msg.currentPath === picked.filePath && msg.currentMatch) ? msg.currentMatch : undefined;
              const match = await vscode.window.showInputBox({
                prompt: "Optional: enter text to match in the file (leave empty to open file at top)",
                placeHolder: "match text",
                value: prefill,
              });
              if (match === undefined) break; // user cancelled
              fileLink = match ? { path: picked.filePath, match } : { path: picked.filePath };
            }

            const result: ExtensionToWebviewMessage = {
              type: "fileLinkResult",
              targetId: msg.targetId,
              targetKind: msg.targetKind,
              fileLink,
            };
            webview.postMessage(result);
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
      background: var(--vscode-editor-background);
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
    #reset-view-btn {
      right: 48px;
    }
    #snap-btn {
      right: 88px;
    }
    #edge-btn {
      right: 128px;
    }
    #theme-btn {
      right: 168px;
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
    .color-wrapper {
      position: relative;
      overflow: visible;
    }
    .color-clear {
      position: absolute;
      top: -5px;
      right: -5px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #aa3333;
      color: white;
      font-size: 10px;
      line-height: 14px;
      text-align: center;
      cursor: pointer;
      z-index: 2;
      border: none;
      padding: 0;
    }
    .color-clear:hover {
      background: #cc4444;
    }
    .color-wrapper.is-none .color-clear {
      display: none;
    }
    .no-color-overlay {
      display: none;
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 1;
      border-radius: 3px;
    }
    .no-color-overlay::after {
      content: "";
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(
        135deg,
        transparent,
        transparent 3px,
        rgba(255, 80, 80, 0.45) 3px,
        rgba(255, 80, 80, 0.45) 4px
      );
      border-radius: 3px;
    }
    .color-wrapper.is-none .no-color-overlay {
      display: block;
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
    #border-color-wrapper {
      position: relative;
      width: 32px;
      height: 32px;
      border: 3px solid #333333;
      border-radius: 4px;
      cursor: pointer;
      overflow: hidden;
      box-sizing: border-box;
    }
    #border-color-wrapper #border-color {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }
    #border-color-label {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 16px;
      pointer-events: none;
      color: var(--vscode-dropdown-foreground, #cccccc);
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
    #context-menu {
      display: none;
      position: fixed;
      z-index: 1000;
      min-width: 160px;
      background: var(--vscode-menu-background, var(--vscode-dropdown-background, #252526));
      color: var(--vscode-menu-foreground, var(--vscode-dropdown-foreground, #cccccc));
      border: 1px solid var(--vscode-menu-border, var(--vscode-editorWidget-border, #454545));
      border-radius: 4px;
      padding: 4px 0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: 12px;
    }
    .context-menu-item {
      padding: 6px 20px;
      cursor: pointer;
      white-space: nowrap;
    }
    .context-menu-item:hover {
      background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground, #094771));
      color: var(--vscode-menu-selectionForeground, var(--vscode-list-hoverForeground, #ffffff));
    }
    .context-menu-separator {
      height: 1px;
      margin: 4px 8px;
      background: var(--vscode-menu-separatorBackground, var(--vscode-editorWidget-border, #454545));
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
    #group-status {
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
      pointer-events: auto;
      white-space: nowrap;
    }
    #group-status a {
      color: var(--vscode-textLink-foreground, #3794ff);
      cursor: pointer;
      text-decoration: none;
    }
    #group-status a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div id="canvas-container"></div>
  <button id="theme-btn" class="toolbar-btn" title="Theme: Standard"></button>
  <button id="edge-btn" class="toolbar-btn" title="Add Edge"></button>
  <button id="snap-btn" class="toolbar-btn" title="Snap to grid (on)"></button>
  <button id="lock-btn" class="toolbar-btn" title="Lock editing"></button>
  <button id="reset-view-btn" class="toolbar-btn" title="Reset view">
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 3h5v2H5v3H3V3zM16 3h5v5h-2V5h-3V3zM3 16v5h5v-2H5v-3H3zM19 19v-3h2v5h-5v-2h3z" fill="currentColor"/></svg>
  </button>
  <div id="edge-mode-status"></div>
  <div id="group-status"></div>
  <div id="sidebar">
    <div id="fill-color-wrapper" class="color-wrapper" title="Node color">
      <input type="color" id="fill-color" class="color-field">
      <span class="no-color-overlay"></span>
      <span class="color-clear">×</span>
    </div>
    <div id="text-color-wrapper" title="Label color">
      <span id="text-color-label">T</span>
      <input type="color" id="text-color" class="color-field">
    </div>
    <div id="border-color-wrapper" class="color-wrapper" title="Border color">
      <span id="border-color-label">▢</span>
      <input type="color" id="border-color" class="color-field">
      <span class="no-color-overlay"></span>
      <span class="color-clear">×</span>
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

import * as vscode from "vscode";
import { documentSchema } from "jumpgate/schema";
import type { FileLink } from "jumpgate/schema";
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from "./messages";

export class JgEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "jumpgate.preview";

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      JgEditorProvider.viewType,
      new JgEditorProvider(context),
      {
        webviewOptions: { retainContextWhenHidden: true },
      },
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const webview = webviewPanel.webview;

    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist")],
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
            edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), newContent);
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
              const viewColumn =
                otherGroups[0]?.viewColumn ??
                (backgroundOpen ? vscode.ViewColumn.Beside : undefined);
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
              items.push({
                label: "$(trash) Remove File Link",
                action: "remove",
              });
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
                value:
                  msg.currentPath && /^https?:\/\//.test(msg.currentPath)
                    ? msg.currentPath
                    : undefined,
              });
              if (url === undefined) break; // user cancelled
              if (url) {
                fileLink = { path: url };
              } else {
                break; // empty input
              }
            } else if (picked.filePath) {
              const prefill =
                msg.currentPath === picked.filePath && msg.currentMatch
                  ? msg.currentMatch
                  : undefined;
              const match = await vscode.window.showInputBox({
                prompt:
                  "Optional: enter text to match in the file (leave empty to open file at top)",
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
      },
    );

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString() && !isApplyingEdit) {
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
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js"),
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
  </style>
</head>
<body>
  <div id="editor-container" style="width:100%;height:100%"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

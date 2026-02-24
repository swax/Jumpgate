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
        content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--vscode-editor-background);
    }
    #canvas-container {
      width: 100%;
      height: 100%;
    }
    #lock-btn {
      position: fixed;
      top: 8px;
      right: 8px;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 4px;
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #cccccc);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      padding: 4px;
      opacity: 0.7;
    }
    #lock-btn:hover {
      opacity: 1;
      background: var(--vscode-button-secondaryHoverBackground, #45494e);
    }
    #lock-btn svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }
    #sidebar {
      position: fixed;
      top: 48px;
      right: 11px;
      z-index: 10;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .color-field {
      width: 24px;
      height: 24px;
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
  </style>
</head>
<body>
  <div id="canvas-container"></div>
  <button id="lock-btn" title="Lock editing"></button>
  <div id="sidebar" style="display:none">
    <input type="color" id="fill-color" class="color-field" title="Node color">
    <input type="color" id="text-color" class="color-field" title="Label color">
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

import * as vscode from "vscode";
import { boxSchema } from "./schema";

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
    webviewPanel.webview.options = { enableScripts: false };

    const updateWebview = () => {
      webviewPanel.webview.html = this.getHtmlForWebview(document);
    };

    const changeDocumentSubscription =
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          updateWebview();
        }
      });

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });

    updateWebview();
  }

  private getHtmlForWebview(document: vscode.TextDocument): string {
    const text = document.getText();
    let content: string;

    try {
      const json: unknown = JSON.parse(text);
      const result = boxSchema.safeParse(json);

      if (!result.success) {
        const errors = result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("<br>");
        content = `<div class="error">Invalid VSCP file:<br>${errors}</div>`;
      } else {
        const { x, y, width, height } = result.data;
        content = `
          <svg viewBox="${x - 10} ${y - 10} ${width + 20} ${height + 20}"
               style="max-width:100%;max-height:100vh;">
            <rect x="${x}" y="${y}" width="${width}" height="${height}"
                  fill="none" stroke="var(--vscode-editor-foreground)" stroke-width="2"/>
          </svg>`;
      }
    } catch {
      content = `<div class="error">Failed to parse JSON</div>`;
    }

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 16px;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .error {
      color: var(--vscode-errorForeground);
      font-family: var(--vscode-font-family);
      font-size: 14px;
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
  }
}

import * as vscode from "vscode";
import { VscpEditorProvider } from "./vscpEditorProvider";
import { documentSchema } from "./schema";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(VscpEditorProvider.register(context));
  context.subscriptions.push(
    vscode.commands.registerCommand("perspective.linkToNode", linkToNodeCommand)
  );
}

async function linkToNodeCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active text editor.");
    return;
  }

  const filePath = vscode.workspace.asRelativePath(editor.document.uri);
  const selection = editor.document.getText(editor.selection) || undefined;

  // Find open .vscp documents
  const vscpDocs = vscode.workspace.textDocuments.filter((d) =>
    d.uri.fsPath.endsWith(".vscp")
  );

  if (vscpDocs.length === 0) {
    vscode.window.showErrorMessage("No .vscp file is currently open.");
    return;
  }

  let vscpDoc: vscode.TextDocument;
  if (vscpDocs.length === 1) {
    vscpDoc = vscpDocs[0];
  } else {
    const pick = await vscode.window.showQuickPick(
      vscpDocs.map((d) => ({
        label: vscode.workspace.asRelativePath(d.uri),
        doc: d,
      })),
      { placeHolder: "Choose a .vscp file" }
    );
    if (!pick) return;
    vscpDoc = pick.doc;
  }

  // Parse document
  let parsed;
  try {
    const json: unknown = JSON.parse(vscpDoc.getText());
    const result = documentSchema.safeParse(json);
    if (!result.success) {
      vscode.window.showErrorMessage("Failed to parse .vscp file.");
      return;
    }
    parsed = result.data;
  } catch {
    vscode.window.showErrorMessage("Failed to parse .vscp file.");
    return;
  }

  if (parsed.nodes.length === 0) {
    vscode.window.showErrorMessage("No nodes found in .vscp file.");
    return;
  }

  // Pick a node
  const nodePick = await vscode.window.showQuickPick(
    parsed.nodes.map((n) => ({
      label: n.label || n.id,
      description: n.label ? n.id : undefined,
      nodeId: n.id,
    })),
    { placeHolder: "Choose a node to link" }
  );
  if (!nodePick) return;

  // Update the node's fileLink in the JSON
  const fullJson = JSON.parse(vscpDoc.getText());
  const targetNode = fullJson.nodes.find(
    (n: { id: string }) => n.id === nodePick.nodeId
  );
  if (!targetNode) return;

  targetNode.fileLink = { path: filePath, ...(selection ? { match: selection } : {}) };

  const newContent = JSON.stringify(fullJson, null, 2) + "\n";
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    vscpDoc.uri,
    new vscode.Range(0, 0, vscpDoc.lineCount, 0),
    newContent
  );
  await vscode.workspace.applyEdit(edit);
}

export function deactivate(): void {}

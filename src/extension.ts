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

  if (parsed.nodes.length === 0 && parsed.edges.length === 0) {
    vscode.window.showErrorMessage("No nodes or edges found in .vscp file.");
    return;
  }

  // Build quick pick items for nodes and edges
  const nodeMap = new Map(parsed.nodes.map((n) => [n.id, n]));

  type LinkPickItem = vscode.QuickPickItem & { targetId: string; targetKind: "node" | "edge" };

  const nodeItems: LinkPickItem[] = parsed.nodes.map((n) => ({
    label: n.label || n.id,
    description: n.label ? `Node: ${n.id}` : "Node",
    targetId: n.id,
    targetKind: "node" as const,
  }));

  function edgeEndpointLabel(ep: { nodeId?: string; x?: number; y?: number }): string {
    if ("nodeId" in ep && ep.nodeId) {
      const n = nodeMap.get(ep.nodeId);
      return n?.label || ep.nodeId;
    }
    return `(${ep.x}, ${ep.y})`;
  }

  const edgeItems: LinkPickItem[] = parsed.edges.map((e) => ({
    label: e.label || `${edgeEndpointLabel(e.from as any)} → ${edgeEndpointLabel(e.to as any)}`,
    description: e.label ? `Edge: ${e.id}` : "Edge",
    targetId: e.id,
    targetKind: "edge" as const,
  }));

  const items: LinkPickItem[] = [...nodeItems, ...edgeItems];

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: "Choose a node or edge to link",
  });
  if (!pick) return;

  // Update the target's fileLink in the JSON
  const fullJson = JSON.parse(vscpDoc.getText());
  const fileLink = { path: filePath, ...(selection ? { match: selection } : {}) };

  if (pick.targetKind === "node") {
    const targetNode = fullJson.nodes.find(
      (n: { id: string }) => n.id === pick.targetId
    );
    if (!targetNode) return;
    targetNode.fileLink = fileLink;
  } else {
    const targetEdge = fullJson.edges?.find(
      (e: { id: string }) => e.id === pick.targetId
    );
    if (!targetEdge) return;
    targetEdge.fileLink = fileLink;
  }

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

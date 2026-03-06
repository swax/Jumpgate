import * as vscode from "vscode";
import { JgEditorProvider } from "./jgEditorProvider";
import { documentSchema } from "jumpgate/schema";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(JgEditorProvider.register(context));
  context.subscriptions.push(
    vscode.commands.registerCommand("jumpgate.linkToNode", linkToNodeCommand),
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

  // Find open .jg documents
  const jgDocs = vscode.workspace.textDocuments.filter((d) => d.uri.fsPath.endsWith(".jg"));

  if (jgDocs.length === 0) {
    vscode.window.showErrorMessage("No .jg file is currently open.");
    return;
  }

  let jgDoc: vscode.TextDocument;
  if (jgDocs.length === 1) {
    jgDoc = jgDocs[0];
  } else {
    const pick = await vscode.window.showQuickPick(
      jgDocs.map((d) => ({
        label: vscode.workspace.asRelativePath(d.uri),
        doc: d,
      })),
      { placeHolder: "Choose a .jg file" },
    );
    if (!pick) return;
    jgDoc = pick.doc;
  }

  // Parse document
  let parsed;
  try {
    const json: unknown = JSON.parse(jgDoc.getText());
    const result = documentSchema.safeParse(json);
    if (!result.success) {
      vscode.window.showErrorMessage("Failed to parse .jg file.");
      return;
    }
    parsed = result.data;
  } catch {
    vscode.window.showErrorMessage("Failed to parse .jg file.");
    return;
  }

  if (parsed.nodes.length === 0 && parsed.edges.length === 0) {
    vscode.window.showErrorMessage("No nodes or edges found in .jg file.");
    return;
  }

  // Build quick pick items for nodes and edges
  const nodeMap = new Map(parsed.nodes.map((n) => [n.id, n]));

  type LinkPickItem = vscode.QuickPickItem & {
    targetId: string;
    targetKind: "node" | "edge";
  };

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
    label:
      e.label ||
      `${edgeEndpointLabel(e.from as { nodeId?: string; x?: number; y?: number })} → ${edgeEndpointLabel(e.to as { nodeId?: string; x?: number; y?: number })}`,
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
  const fullJson = JSON.parse(jgDoc.getText());
  const fileLink = {
    path: filePath,
    ...(selection ? { match: selection } : {}),
  };

  if (pick.targetKind === "node") {
    const targetNode = fullJson.nodes.find((n: { id: string }) => n.id === pick.targetId);
    if (!targetNode) return;
    targetNode.fileLink = fileLink;
  } else {
    const targetEdge = fullJson.edges?.find((e: { id: string }) => e.id === pick.targetId);
    if (!targetEdge) return;
    targetEdge.fileLink = fileLink;
  }

  const newContent = JSON.stringify(fullJson, null, 2) + "\n";
  const edit = new vscode.WorkspaceEdit();
  edit.replace(jgDoc.uri, new vscode.Range(0, 0, jgDoc.lineCount, 0), newContent);
  await vscode.workspace.applyEdit(edit);
}

export function deactivate(): void {}

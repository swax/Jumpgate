import * as vscode from "vscode";
import { VscpEditorProvider } from "./vscpEditorProvider";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(VscpEditorProvider.register(context));
}

export function deactivate(): void {}

// VS Code webview API
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};

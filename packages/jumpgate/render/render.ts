// Browser entry for `npm run render`. Bundled by render.mjs with the .jg
// contents baked in via esbuild `define`, loaded in headless Chromium, and
// screenshotted once `window.__jumpgateReady` flips to true.
import { createJumpgateEditor, documentSchema } from "../src/index";

declare const __RENDER_DOC__: string;
declare const __RENDER_PADDING__: number;

declare global {
  interface Window {
    __jumpgateReady?: boolean;
    __jumpgateError?: string;
  }
}

async function main(): Promise<void> {
  const style = document.createElement("style");
  style.textContent = `
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #1e1e1e; }
    #editor-container { width: 100%; height: 100%; }
    .jumpgate-editor .toolbar-btn,
    .jumpgate-editor #sidebar,
    .jumpgate-editor #edge-mode-status,
    .jumpgate-editor #group-status { display: none !important; }
  `;
  document.head.appendChild(style);

  const container = document.createElement("div");
  container.id = "editor-container";
  document.body.appendChild(container);

  const result = documentSchema.safeParse(JSON.parse(__RENDER_DOC__));
  if (!result.success) {
    throw new Error("Invalid .jg file: " + result.error.message);
  }

  const editor = await createJumpgateEditor(container);
  editor.setDocument(result.data);
  editor.fitToView(__RENDER_PADDING__);

  // Let the ticker run a few frames so the DOM labels sync to the viewport
  // and fonts settle before the screenshot is taken.
  await document.fonts.ready;
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => requestAnimationFrame(r));
  }
  window.__jumpgateReady = true;
}

main().catch((err: unknown) => {
  window.__jumpgateError = err instanceof Error ? err.message : String(err);
});

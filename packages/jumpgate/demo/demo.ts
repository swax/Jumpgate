import { createJumpgateEditor, documentSchema, type JgDocument, type JumpgateEditor } from "../src/index";

const EMPTY_DOC: JgDocument = { nodes: [], edges: [] };

let editor: JumpgateEditor;
let currentDoc: JgDocument = EMPTY_DOC;
let currentFilename = "";

async function main(): Promise<void> {
  const container = document.getElementById("editor-container") as HTMLDivElement;
  const fileInput = document.getElementById("file-input") as HTMLInputElement;
  const filenameEl = document.getElementById("filename") as HTMLSpanElement;

  editor = await createJumpgateEditor(container, {
    onDocumentChanged: (doc) => {
      currentDoc = doc;
    },
    onOpenFileLink: (path) => {
      if (/^https?:\/\//.test(path)) {
        window.open(path, "_blank");
      }
    },
  });

  editor.setDocument(EMPTY_DOC);

  // Open button
  document.getElementById("open-btn")!.addEventListener("click", () => {
    fileInput.click();
  });

  // File input change
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) loadFile(file);
    fileInput.value = "";
  });

  // Save button — download as .jg
  document.getElementById("save-btn")!.addEventListener("click", () => {
    const json = JSON.stringify(currentDoc, null, 2) + "\n";
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentFilename || "diagram.jg";
    a.click();
    URL.revokeObjectURL(url);
  });

  // New button
  document.getElementById("new-btn")!.addEventListener("click", () => {
    currentFilename = "";
    filenameEl.textContent = "";
    currentDoc = EMPTY_DOC;
    editor.setDocument(EMPTY_DOC);
  });

  // Drag and drop
  const dropOverlay = document.getElementById("drop-overlay") as HTMLDivElement;
  let dragCounter = 0;

  document.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    dropOverlay.style.display = "flex";
  });

  document.addEventListener("dragleave", () => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropOverlay.style.display = "none";
    }
  });

  document.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  document.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.style.display = "none";
    const file = e.dataTransfer?.files[0];
    if (file && file.name.endsWith(".jg")) {
      loadFile(file);
    }
  });

  function loadFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json: unknown = JSON.parse(reader.result as string);
        const result = documentSchema.safeParse(json);
        if (result.success) {
          currentDoc = result.data;
          currentFilename = file.name;
          filenameEl.textContent = file.name;
          editor.setDocument(currentDoc);
        } else {
          alert("Invalid .jg file: " + result.error.message);
        }
      } catch {
        alert("Failed to parse JSON");
      }
    };
    reader.readAsText(file);
  }
}

main();

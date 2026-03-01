import { getState, subscribe, updateNode, getNodeById } from "../state";

let statusEl: HTMLElement;
let onEditCallback: () => void;
let dragMessage: string | null = null;

export function setupGroupStatus(onEdit: () => void): void {
  statusEl = document.getElementById("group-status") as HTMLElement;
  onEditCallback = onEdit;

  subscribe(() => {
    if (!dragMessage) {
      updateSelectionMessage();
    }
  });
}

function updateSelectionMessage(): void {
  const state = getState();
  if (state.selectedNodeIds.length === 1) {
    const node = getNodeById(state.selectedNodeIds[0]);
    if (node?.parentId) {
      const parent = getNodeById(node.parentId);
      const parentLabel = parent?.label || parent?.id || node.parentId;
      if (!state.locked) {
        statusEl.innerHTML = `In group: ${escapeHtml(parentLabel)} \u2014 <a id="group-remove-link">Remove</a>`;
        statusEl.style.display = "block";
        const removeLink = document.getElementById("group-remove-link");
        if (removeLink) {
          removeLink.addEventListener("click", (e) => {
            e.preventDefault();
            updateNode(node.id, { parentId: null });
            onEditCallback();
          });
        }
        return;
      }
    }
  }
  statusEl.style.display = "none";
  statusEl.innerHTML = "";
}

export function showGroupDragMessage(text: string): void {
  dragMessage = text;
  statusEl.innerHTML = escapeHtml(text);
  statusEl.style.display = "block";
}

export function hideGroupDragMessage(): void {
  dragMessage = null;
  updateSelectionMessage();
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

import type { Box } from "../schema";
import { getState, subscribe } from "./state";

const DEFAULT_FILL = "#888888";
const DEFAULT_TEXT = "#cccccc";

export interface SidebarCallbacks {
  onBoxChanged: (
    id: string,
    changes: Partial<Pick<Box, "color" | "textColor">>
  ) => void;
}

export function setupSidebar(
  container: HTMLElement,
  callbacks: SidebarCallbacks
): void {
  const fillInput = container.querySelector<HTMLInputElement>("#fill-color")!;
  const textInput = container.querySelector<HTMLInputElement>("#text-color")!;

  fillInput.addEventListener("input", () => {
    const { selectedBoxId } = getState();
    if (selectedBoxId) {
      callbacks.onBoxChanged(selectedBoxId, { color: fillInput.value });
    }
  });

  textInput.addEventListener("input", () => {
    const { selectedBoxId } = getState();
    if (selectedBoxId) {
      callbacks.onBoxChanged(selectedBoxId, { textColor: textInput.value });
    }
  });

  subscribe(() => {
    const { document: doc, selectedBoxId, locked } = getState();
    const selectedBox = selectedBoxId
      ? doc.boxes.find((b) => b.id === selectedBoxId)
      : null;

    const hidden = !selectedBox || locked;
    const sidebar = container.querySelector<HTMLElement>("#sidebar")!;
    sidebar.style.display = hidden ? "none" : "";

    if (selectedBox) {
      fillInput.value = selectedBox.color ?? DEFAULT_FILL;
      textInput.value = selectedBox.textColor ?? DEFAULT_TEXT;
    }
  });
}

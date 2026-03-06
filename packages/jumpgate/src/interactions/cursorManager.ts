export type CursorKey = string;

type CursorEntry = {
  cursor: string;
  priority: number;
};

export interface CursorManager {
  set: (key: CursorKey, cursor: string, priority?: number) => void;
  clear: (key: CursorKey) => void;
}

export function createCursorManager(canvas: HTMLCanvasElement): CursorManager {
  const baseCursor = canvas.style.cursor;
  const entries = new Map<CursorKey, CursorEntry>();

  function update(): void {
    if (entries.size === 0) {
      canvas.style.cursor = baseCursor;
      return;
    }

    let best: CursorEntry | null = null;
    for (const entry of entries.values()) {
      if (!best || entry.priority > best.priority) {
        best = entry;
      }
    }

    canvas.style.cursor = best ? best.cursor : baseCursor;
  }

  return {
    set: (key, cursor, priority = 0) => {
      entries.set(key, { cursor, priority });
      update();
    },
    clear: (key) => {
      if (entries.delete(key)) {
        update();
      }
    },
  };
}

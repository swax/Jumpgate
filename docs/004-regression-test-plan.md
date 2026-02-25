# 004 - Regression Test Plan

Basic manual test plan for the VS Code Perspective diagram editor.

**Setup**: Open a `.vscp` file in VS Code. Start with a file containing a few nodes and edges.

---

## 1. Viewport

- [ ] Click and drag empty canvas to pan
- [ ] Scroll wheel to zoom in/out (should zoom toward cursor)
- [ ] Verify zoom range clamps (can't zoom infinitely in or out)

## 2. Node Selection

- [ ] Click a node to select it (dashed outline + resize handles appear)
- [ ] Click empty canvas to deselect
- [ ] Shift+click multiple nodes to multi-select
- [ ] Shift+click a selected node to deselect it

## 3. Node Movement

- [ ] Drag a selected node to move it
- [ ] Multi-select several nodes, drag one — all move together
- [ ] Enable snap-to-grid, drag a node — snaps to 20px grid

## 4. Node Resize

- [ ] Select a single node, drag a corner handle to resize
- [ ] Drag an edge handle (top/bottom/left/right) to resize in one axis
- [ ] Multi-select nodes, drag a handle — all scale proportionally

## 5. Node Labels

- [ ] Double-click a node to open the text editor
- [ ] Type a label, click away or press Enter to save
- [ ] Double-click again, press Escape to cancel edit (reverts)
- [ ] Verify label text wraps within node bounds

## 6. Copy & Paste

- [ ] Select node(s), Ctrl+C then Ctrl+V — pasted nodes appear offset +20,+20
- [ ] Paste again — cascades further diagonally
- [ ] Pasted nodes are automatically selected

## 7. Delete

- [ ] Select a node, press Delete — node removed
- [ ] Verify edges connected to the deleted node are also removed
- [ ] Select an edge, press Delete — edge removed

## 8. Edge Creation

- [ ] Click the Add Edge toolbar button to enter edge mode
- [ ] Click a node (source), then click another node (target) — edge created
- [ ] Verify cursor dot turns red when hovering a node, blue on empty canvas
- [ ] Create an edge from a free point to a free point (no node attachment)
- [ ] Verify self-loops are prevented (same node for source and target)
- [ ] Press Escape to exit edge mode

## 9. Edge Editing

- [ ] Click an edge to select it (turns blue, shows endpoint handles)
- [ ] Drag an endpoint handle to reconnect it to a different node
- [ ] Drag an endpoint handle to a free point

## 10. Color Pickers

- [ ] Select a node — sidebar appears with fill and text color pickers
- [ ] Change fill color — node updates immediately
- [ ] Change text color — label updates immediately
- [ ] Multi-select nodes, change color — all update

## 11. Snap to Grid

- [ ] Toggle snap-to-grid button (toolbar grid icon)
- [ ] Verify visual feedback (bright = on, dim = off)
- [ ] With snap on: move nodes, resize nodes, place edge endpoints — all snap to grid
- [ ] With snap off: movement is free-form

## 12. Lock Mode

- [ ] Toggle lock button (toolbar lock icon)
- [ ] When locked: cannot select, drag, resize, edit labels, or create edges
- [ ] When locked: pan and zoom still work
- [ ] When locked: toolbar buttons (except lock) are hidden, sidebar is hidden
- [ ] Unlock — full editing restored

## 13. File Persistence

- [ ] Make changes, press Ctrl+S to save
- [ ] Close and reopen the file — all changes persisted
- [ ] Ctrl+Z to undo changes (VS Code native undo)
- [ ] Verify the `.vscp` file contains valid JSON with nodes and edges

## 14. Zoom Consistency

- [ ] Zoom in/out and verify: selection outlines, resize handles, and labels remain visually consistent (scale inversely with zoom)
- [ ] Double-click to edit a label while zoomed — editor font size matches zoom level

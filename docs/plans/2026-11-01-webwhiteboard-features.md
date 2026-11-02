# WebWhiteboard Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the 4 core features of WebWhiteboard (Miro) into NotePages: Sticky Notes, Direct Shape Creation Palette, Connection Lines & Arrows, and Quick Contextual Actions on the existing horizontal toolbar.

**Architecture:** Extend existing canvas elements (TextObject, ShapeObject) and toolbar controls with clean typed models, canvas previews, and SVG/Lucide icons while maintaining strict backward compatibility with DocumentSerializer and HistoryManager.

**Tech Stack:** TypeScript (strict mode, zero any), HTML5 Canvas 2D Context, CSS3, Obsidian API, Node.js Test Runner.

---

### Task 1: Sticky Notes Feature

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/text/TextController.ts`
- Modify: `src/view/NotePagesView.ts`
- Modify: `styles.css`
- Test: `tests/StickyNote.test.ts`

**Step 1: Write the failing test**
Create `tests/StickyNote.test.ts` testing `isSticky` serialization, creation bounds, and history commands.

**Step 2: Run test to verify it fails**
Run: `npm test`
Expected: FAIL due to missing `isSticky` or `tests/StickyNote.test.ts` assertions.

**Step 3: Implement minimal code**
- Add `"sticky"` to `ToolType` and `isSticky?: boolean` to `TextObject` in `src/types/index.ts`.
- Add Sticky Note tool button and pastel color palette (`#fef08a`, `#bbf7d0`, `#bfdbfe`, `#fbcfe8`, `#fed7aa`, `#e9d5ff`) in `NotePagesView.ts`.
- Support click-to-drop (140x140) and drag-to-size sticky notes.
- Style `.notepages-sticky-note` in `styles.css` with realistic paper drop shadow, padding, and font styling.
- Update `TextController` to render and edit sticky notes with matching background color.

**Step 4: Run test to verify it passes**
Run: `npm test`
Expected: PASS.

---

### Task 2: Direct Shape Creation Palette

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/shape/ShapeRecognizer.ts`
- Modify: `src/ink/InkingController.ts`
- Modify: `src/view/NotePagesView.ts`
- Modify: `styles.css`
- Test: `tests/ShapePalette.test.ts`

**Step 1: Write the failing test**
Create `tests/ShapePalette.test.ts` testing rendering of new shape types (`rounded-rectangle`, `diamond`, `arrow`, `star`, `callout`).

**Step 2: Run test to verify it fails**
Run: `npm test`
Expected: FAIL due to unimplemented shape types.

**Step 3: Implement minimal code**
- Extend `ShapeType` in `src/types/index.ts` with `"rounded-rectangle" | "diamond" | "arrow" | "star" | "callout"`.
- Implement path rendering in `ShapeRecognizer.renderShape` for all new types.
- Add shape selection dropdown / palette on the toolbar when Shape tool is active.
- Add live drag-to-create preview on the active canvas for the selected shape geometry.
- Commit created shape to `page.shapes` and history manager on pointerup.

**Step 4: Run test to verify it passes**
Run: `npm test`
Expected: PASS.

---

### Task 5: Connection Lines and Arrows Tool

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/view/NotePagesView.ts`
- Modify: `styles.css`
- Test: `tests/Connector.test.ts`

**Step 1: Write the failing test**
Create `tests/Connector.test.ts` verifying connector shape creation and endpoints.

**Step 2: Run test to verify it fails**
Run: `npm test`
Expected: FAIL.

**Step 3: Implement minimal code**
- Add `"connector"` to `ToolType` in `src/types/index.ts`.
- Add Connector button to toolbar (`icon: "arrow-right"`).
- Implement connector pointerdown/move/up handling on active canvas with real-time arrow preview.
- Support straight line with arrow head, connecting from start to end coordinates.
- Save as `ShapeObject` with type `"arrow"` and history tracking.

**Step 4: Run test to verify it passes**
Run: `npm test`
Expected: PASS.

---

### Task 4: Integration, Styling & Deployment

**Files:**
- Modify: `styles.css`
- Check comments: `grep -rn "//\|/\*" src/ styles.css`
- Check console.log: `grep -rn "console\.log" src/`
- Build & Deploy: `npm run build && cp manifest.json main.js styles.css ~/Obsidian/Vinh_Hung/.obsidian/plugins/notepages/`

# Obsinotes

Obsinotes is a modern, high-performance digital whiteboard and multi-page notebook plugin for Obsidian, designed for handwriting with stylus inking, paper templates, sticky notes, rich geometric shapes, LaTeX math, and Goodnotes-like continuous vertical scrolling.

## Key Features

- **Obsidian Native Integration**:
  - Custom file view for `.gnote.md` notebook documents.
  - Ribbon icon for quick notebook creation.
  - Command palette actions (`Create new Obsinotes notebook`, `Toggle between Obsinotes and Markdown view`).
  - View header action to seamlessly toggle between visual Obsinotes whiteboard and raw Markdown source.
  - Settings tab for configuring default page size, orientation, paper templates, touch policy, and autosave delay.
- **Multi-page Whiteboard & Canvas**:
  - Fixed-size paper pages (A4 / US Letter / Custom) with high DPI rendering.
  - Procedural paper templates (Blank, Ruled, Grid, Dotted, Cornell).
  - Continuous vertical scroll workspace with zoom control (40% to 300%).
  - Sidebar with page thumbnails and collapsible drawer.
  - Clean lifecycle management: zero memory or listener leaks on view unload.
- **Digital Inking & Whiteboard Tools**:
  - Low-latency vector inking (Ballpoint Pen, Pressure Pen, Fountain Pen).
  - Highlighter with authentic multiply blending.
  - Stroke Eraser and Precision Eraser.
  - Hold-to-snap Shape Recognition (lines, circles, rectangles, triangles).
  - WebWhiteboard Shape Palette (rectangles, rounded rectangles, diamonds, arrows, stars, callouts, and fill color toggle).
  - Connector Tool: Draw connection lines and arrows with live interactive previews.
  - Pastel Sticky Notes with click/drag-to-size, realistic drop shadow, and inline formatting.
  - LaTeX Math rendering (`$...$`, `$$...$$`) and Obsidian Wikilinks (`[[...]]`).
  - Comprehensive Image Management: Upload from computer disk, select from vault, drag-and-drop, clipboard paste, proportional resize handles, direct drag move, and write/draw over images.

## Development & Build

### Requirements
- Node.js v18 or newer
- npm v9 or newer

### Installation
```bash
npm install
```

### Typecheck
```bash
npm run typecheck
```

### Run Tests
```bash
npm test
```

### Production Build
```bash
npm run build
```

This generates `main.js` in the root folder.

## How to Test in an Obsidian Vault

1. Copy the following files into your Obsidian vault's plugin directory:
   `<Vault>/.obsidian/plugins/obsinotes/`
   - `manifest.json`
   - `main.js`
   - `styles.css`
2. Open Obsidian and navigate to **Settings -> Community Plugins**.
3. Reload community plugins and enable **Obsinotes**.
4. Click the notebook icon in the left ribbon or run the command `Create new Obsinotes notebook`.
5. An empty notebook will open. You can draw, add pages, insert sticky notes, add geometric shapes, or switch to raw Markdown mode.

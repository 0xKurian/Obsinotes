# Obsinotes

Obsinotes is a modern, high-performance digital whiteboard and multi-page notebook plugin for [Obsidian](https://obsidian.md), designed for handwriting with stylus inking, paper templates, sticky notes, rich geometric shapes, LaTeX math, PDF annotation, off-screen multi-format export, and Goodnotes-like continuous vertical scrolling.

---

## Key Features

### 1. Multi-Page Notebook Canvas
- **Physical Paper Sizes**: Accurate dimensions for A4 (595.28 × 841.89 pt), US Letter (612 × 792 pt), and Custom sizes in both Portrait and Landscape orientations.
- **Procedural Paper Templates**: Clean vector-rendered Blank, Ruled (Lined), Grid, Dotted, and Cornell note-taking layouts.
- **Continuous Workspace**: Smooth vertical scrolling with zoom scaling from 40% up to 300%.
- **Page Management**: Add, duplicate, delete, and reorder pages with real-time thumbnail preview drawer in the sidebar.

### 2. High-Performance Digital Inking Engine
- **Stylus Inking Tools**: Ballpoint Pen, Pressure-Sensitive Pen, and Fountain Pen powered by `perfect-freehand`.
- **Customizable Stroke Width**: Fine-tune stroke thickness from 0.5pt to 30.0pt using preset buttons, interactive slider, or mouse wheel, complete with a live size/color preview dot and per-tool memory (Pen vs. Highlighter).
- **Authentic Highlighter**: Layered with canvas `multiply` composite blending to highlight text without obscuring underlying handwriting or PDF content.
- **Smart Erasers**: Dual-mode Stroke Eraser (deletes entire intersecting strokes) and Precision Eraser (splits and trims stroke geometry).
- **Stylus & Palm Suppression**: Differentiates pen and finger touches, preventing unintended ink when resting palm on the screen.
- **60–120 FPS Performance**: `requestAnimationFrame` batching handles high-frequency stylus input without dropped frames or visual lag.

### 3. Smart Shapes & Connectors
- **Hold-to-Snap Shape Recognition**: Draw freehand lines, circles, ellipses, rectangles, or triangles and hold the stylus still for 350ms to snap into perfect geometry.
- **Dedicated Shape Palette**: Quick insertion of rectangles, rounded rectangles, diamonds, circles, arrows, stars, and callout speech bubbles with customizable fill color toggle.
- **Connector Tool**: Draw interactive connector lines and arrows between elements with endpoint snapping and live previews.

### 4. Advanced Notes, Math & Media
- **Pastel Sticky Notes**: Color-coded sticky notes with realistic drop shadows, multi-line support, and drag-to-size handles.
- **Rich Text Boxes**: Floating text boxes with adjustable font size, font family, alignment, bold, italic, and underline styling.
- **LaTeX Math Rendering**: Native MathJax / KaTeX formulas via inline `$...$` and display `$$...$$` syntax.
- **Obsidian Wikilinks**: Full integration with `[[Note Name]]` links, supporting click-to-open and native Obsidian hover previews.
- **Image Management**: Paste from clipboard, drag-and-drop from OS, or insert from vault. Includes proportional resize handles, rotation, and move.
- **PDF Background Annotation**: Import PDF documents directly into notebooks or annotate PDF pages with vector ink and sticky notes.

### 5. Multi-Format Off-Screen Export Engine
- **PDF Export**: Assemble multi-page print-ready PDFs with accurate physical dimensions and 300 DPI resolution using `pdf-lib`. Preserves vector backgrounds on imported PDF annotations.
- **PNG Raster Export**: High-resolution image exports (1x = 72 DPI, 2x = 144 DPI, 4x = 300 DPI) rendered directly from vector document models.
- **Vector SVG Export**: Pure SVG paths, shapes, text, and templates for lossless scaling and vector graphics workflows.
- **Flexible Destinations**: Save exported files directly to your Obsidian Vault (with collision-safe numbering) or download to local disk.

### 6. Viewport Culling & Virtualization
- **RAM & VRAM Optimization**: In multi-page notebooks (50–100+ pages), canvases outside the active viewport window + buffer are deallocated from GPU memory, maintaining bounded, low memory usage.
- **Zero Layout Shift**: Structural DOM containers preserve exact physical heights so scrolling is completely smooth and jitter-free.

---

## Keyboard Shortcuts & Gestures

| Action | Shortcut / Gesture |
| :--- | :--- |
| **Stylus Inking** | Touch stylus to canvas (automatic palm suppression) |
| **Pan Canvas** | Hold `Space` + Drag or Middle Mouse Drag (1 finger drag on touch) |
| **Zoom Workspace** | `Ctrl` / `Cmd` + Mouse Wheel or 2-finger Pinch |
| **Add Page Below** | Press `A` |
| **Undo / Redo** | `Ctrl/Cmd + Z` / `Ctrl/Cmd + Y` (or `Ctrl/Cmd + Shift + Z`) |
| **Decrease / Increase Stroke Width** | `[` / `]` (or scroll wheel over width slider) |
| **Hold-to-Snap Shape** | Draw shape and hold stylus still for ~350ms |
| **Quick Text Box** | Double-click canvas or use Canvas Context Menu |
| **Canvas Context Menu** | Right-click on empty canvas area |
| **Export Notebook** | Toolbar export icon (`file-down`) or Command Palette `Obsinotes: Export notebook` |

---

## Compatibility Matrix

| Platform | Environment | Inking & Hardware Support | Status |
| :--- | :--- | :--- | :--- |
| **macOS** | Desktop (Apple Silicon / Intel) | Trackpad, Mouse, Wacom, Sidecar / Apple Pencil | Supported |
| **Windows** | Desktop / Surface Tablets | Mouse, Touchpad, Microsoft Surface Pen, Wacom AES | Supported |
| **Linux** | Desktop (X11 / Wayland) | Mouse, Touchpad, Wacom Intuos / Cintiq | Supported |
| **iPadOS** | Obsidian Mobile (iPad) | Apple Pencil (1st/2nd Gen, USB-C, Pro), Touch Gestures | Supported |
| **Android** | Obsidian Mobile (Tablets / Foldables) | Samsung S-Pen, Active Stylus, Multi-touch | Supported |

---

## Installation & Setup

### Via Obsidian Community Plugins (Once Approved)
1. Open Obsidian **Settings** -> **Community Plugins**.
2. Search for **Obsinotes** and click **Install**.
3. Toggle the plugin to **Enable**.

### Manual Installation
1. Download the latest release assets (`main.js`, `manifest.json`, `styles.css`) from the [Releases](https://github.com/0xKurian/Obsinotes/releases) page.
2. Create a folder named `obsinotes` in your vault's plugin directory:
   `<Vault>/.obsidian/plugins/obsinotes/`
3. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
4. Reload Obsidian Community Plugins and enable **Obsinotes**.

---

## Development & Build

### Requirements
- Node.js v18 or newer
- npm v9 or newer

### Build Commands
```bash
# Install dependencies
npm install

# Run strict type checking
npm run typecheck

# Execute comprehensive automated test suite (136 unit & integration tests)
npm test

# Build production bundle
npm run build
```

---

## License

MIT License. Developed by Vinh-Hung.

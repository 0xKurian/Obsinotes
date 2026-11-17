<div align="center">

# 📓 NotePages

**A high-performance, local-first digital notebook, PDF annotator, and handwritten whiteboard for [Obsidian](https://obsidian.md).**

[![Obsidian Target](https://img.shields.io/badge/Obsidian-v1.5.12+-purple?logo=obsidian&style=flat-square)](https://obsidian.md)
[![Version](https://img.shields.io/badge/Version-2.0.5-blue?style=flat-square)](https://github.com/0xKurian/Obsinotes/releases)
[![Tests](https://img.shields.io/badge/Tests-246%20Passed-brightgreen?style=flat-square)](https://github.com/0xKurian/Obsinotes)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)

[Why NotePages?](#-why-notepages) • [Quick Start](#-quick-start) • [Core Features](#-core-features) • [Stylus & S-Pen Guide](#-stylus--samsung-s-pen-guide) • [Workspace & Navigation](#-workspace--navigation) • [PDF & Export](#-pdf-import--multi-format-export) • [Shortcuts & Gestures](#-shortcuts--gestures) • [Settings](#-settings--customization) • [FAQ](#-frequently-asked-questions)

</div>

---

## 🌟 Why NotePages?

**NotePages** combines the tactile freedom of pen-and-paper notebooks (like GoodNotes or Samsung Notes) with the local-first, plain-text knowledge graph of **Obsidian**. Whether you are taking lecture notes on a tablet, marking up research PDFs, sketching system architecture diagrams, or solving math equations, every page lives right inside your Obsidian Vault.

> [!NOTE]
> **100% Local & Open Storage:** Every notebook is stored inside your vault as a `.gnote` file containing a clean JSON schema wrapped with Obsidian frontmatter. Everything syncs seamlessly via Obsidian Sync, Git, Syncthing, or iCloud—no cloud lock-in, no telemetry, and full **Markdown source toggle** anytime.

---

## 📦 Installation

### From Obsidian Community Plugins
1. Open **Obsidian Settings → Community plugins**.
2. Disable Restricted Mode (if enabled) and click **Browse**.
3. Search for **NotePages**, click **Install**, and then **Enable**.

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/0xKurian/Obsinotes/releases).
2. Copy them into `<YourVault>/.obsidian/plugins/notepages/`.
3. Reload Obsidian and enable **NotePages** in **Settings → Community plugins**.

---

## 🚀 Quick Start

### 1. Create a Notebook
You can create a `.gnote` notebook in any of three ways:
- Click the **NotePages: New notebook** icon in the left Obsidian Ribbon.
- Open the Command Palette (`Ctrl/Cmd + P`) and run **`NotePages: Create new notebook`**.
- Right-click any folder in the Obsidian File Explorer and choose **New notebook**.

### 2. Configure Your Paper & Page Size
- Click the **Page Menu** button on the floating toolbar to customize the current page or notebook defaults:
  - **Templates:** `Blank`, `Ruled`, `Grid`, `Dotted`, or `Cornell`.
  - **Paper Sizes:** `A4`, `A3`, `A5`, `B5`, `Letter`, `16:9`, `Square`, or `Custom`.
  - **Orientation:** `Portrait` or `Landscape` (`R`).
  - **Stationery Styling:** Customize paper background color (light or dark paper!), line color, and line spacing (`12–64 pt`).

### 3. Write, Sketch, Type, and Annotate
- Select a pen tool (**Pressure Pen**, **Ballpoint**, **Fountain Pen**, **Pencil**, or **Highlighter**), pick a color and width, or save your favorite setup into **Quick Pen Presets**.
- Toggle the **Ruler Straightedge** (`U`) to draw crisp straight lines and underlines along an interactive on-canvas ruler.
- Hold briefly at the end of a freehand stroke (~350ms) to snap into clean geometric **shapes**, or hold a **highlighter** stroke (~300ms) to straighten it.
- Press `T` (or double-click in Select/Text mode) for **Rich Text Boxes** with inline/block **LaTeX math** (`$...$`, `$$...$$`) and **`[[Wikilinks]]`**, or press `N` for pastel **Sticky Notes**.
- Drag and drop images or PDFs directly onto any page, or paste images from your clipboard (`Ctrl/Cmd + V`).

### 4. Organize & Export
- Open the **Pages Sidebar** (`B`) to jump between thumbnails, bookmark key pages, or give pages custom titles.
- Open the **Page Grid Overview** to browse, reorder, duplicate, or manage large notebooks at a glance.
- Export individual pages, custom page ranges, or the entire notebook to **PDF**, high-res **PNG (up to 300 DPI / 4x)**, or editable **SVG**.

---

## 🎨 Core Features

### 1. High-Precision Inking & Pencil Engine
- **Low-Latency Canvas Pipeline:** Powered by `perfect-freehand`, incremental active-stroke prefix baking, spatial indexing, and page backing caches for fluid 60–120 FPS writing—even on large notebooks.
- **Five Writing & Sketching Tools:**
  - **Pressure Pen:** Natural pressure-sensitive line variation for Apple Pencil, Samsung S Pen, Surface Pen, and Wacom tablets.
  - **Ballpoint Pen:** Crisp, uniform strokes ideal for diagrams, equations, and fast note-taking.
  - **Fountain Pen:** Velocity-sensitive calligraphic ink taper.
  - **Pencil:** Textured graphite shading that responds to stylus tilt and pressure for sketching.
  - **Highlighter:** Uses canvas `multiply` blending so ink underneath stays sharp and legible. Pause **~300ms** at the end of a highlight to automatically snap it into a straight line.
- **Stroke Patterns:** Switch between **Solid**, **Dashed**, and **Dotted** styles for pens, pencils, shapes, and connectors.
- **Quick Pen Presets:** Save and switch between your favorite tool + color + width + stroke pattern combinations right from the sub-toolbar.
- **Pen Nib Hover Preview:** Optional size and color preview ring beneath your hovering stylus or mouse cursor.
- **Dual Eraser Engine:**
  - **Stroke Eraser:** Removes whole intersecting strokes and shapes in a single pass.
  - **Precision Eraser:** Trims strokes accurately at the exact eraser radius (`S`, `M`, `L` presets or custom radius).

### 2. Interactive Ruler Guide
- Press `U` or click the **Ruler** icon to overlay a movable, rotatable straightedge on the canvas.
- Drag to reposition or rotate the ruler to any angle; active pen, pencil, and highlighter strokes snap cleanly along its edge.

### 3. Smart Shapes, Connectors & Lasso Selection
- **Auto-Recognize Shapes:** Draw a line, circle, ellipse, rectangle, triangle, or arrow and hold briefly at the end (~350ms) to convert it into a crisp vector shape.
- **Shape Palette & Fills:** Insert rectangles, circles, triangles, lines, and arrows (`S`) with customizable stroke patterns and optional solid color fills.
- **Connectors (`C`):** Draw clean connecting lines and arrows between diagram elements.
- **Cross-Page Lasso Selection (`L`):** Circle strokes, shapes, sticky notes, or text boxes to move, resize, change color/width, copy/paste, duplicate, or drag them across page boundaries.

### 4. Rich Text, Sticky Notes, LaTeX & Media
- **Rich Text Boxes (`T`):** Floating text blocks with customizable font family, font size, bold/italic/underline, alignment, and text color.
- **Pastel Sticky Notes (`N`):** Color-coded sticky notes with soft shadows and drag-to-resize bounds.
- **Native LaTeX Math:** Write inline (`$E = mc^2$`) or display blocks (`$$\int_0^\infty e^{-x^2}\,dx$$`) rendered natively via Obsidian's MathJax engine.
- **Obsidian Wikilinks:** Insert `[[Note Name]]` or `[[Note Name|Alias]]` inside text boxes and sticky notes—click to open or hover with `Ctrl/Cmd` for standard Obsidian page previews.
- **Images (`I`):** Insert vault images via file picker, drag-and-drop images onto a page, or paste screenshots directly from your clipboard (`Ctrl/Cmd + V`).

---

## ✒️ Stylus & Samsung S-Pen Guide

NotePages includes dedicated stylus side-button handling configurable under **Settings → NotePages → Stylus side button**:

| Mode | Behavior | Best For |
| :--- | :--- | :--- |
| **Hold to erase** | Switches to Eraser while the stylus button is held and reverts to your previous tool upon release. | Windows / macOS / Linux tablets (Surface Pen, Wacom, Galaxy Book, compatible desktop drivers) |
| **Toggle eraser on press** | Press the side button while hovering (or tapping) to toggle between your active tool and Eraser. | **Samsung S Pen & Android tablets** (Recommended) |
| **Disabled** | Ignores stylus side-button eraser switching. | Users who prefer manual toolbar switching |

> [!TIP]
> **Using Samsung S Pen on Android / Galaxy Tab:**  
> Set **Stylus side button** to **Toggle eraser on press**. Press the side button while hovering over the page to switch to the eraser, release the button, and rub across strokes to erase; press the side button again to return to your pen.  
> *(Android's Chromium WebView pauses touch/drag pointer delivery while the hardware side button remains held on the glass, so **Toggle** provides the smoothest experience on Android, whereas **Hold to erase** works seamlessly on desktop stylus drivers.)*

---

## 🧭 Workspace & Navigation

- **Fixed Edge-Docked Toolbar:**
  - Drag the grip handle to snap the toolbar cleanly to **Top**, **Bottom**, **Left**, or **Right**—or click the grip handle (or right-click the dock) to switch positions from the toolbar popover.
  - Maintains a fixed, predictable size without automatic row-wrapping or stretching, scrolling horizontally (top/bottom) or vertically (left/right) on narrow panes.
  - Toggle **Notebook Title visibility**, **Zoom controls**, and **Auto-dim while drawing** from the toolbar popover or Settings.
- **Focus Mode (`F`):** Collapse the toolbar to maximize your writing canvas.
- **Pages Sidebar (`B`), Bookmarks & Titles:**
  - View live page thumbnails, filter or star **bookmarked** pages, and assign **custom page titles**.
  - Safely add, duplicate, reorder, or delete pages with full Undo/Redo protection.
- **Page Grid Overview:** Open from the toolbar or Command Palette (`NotePages: Open page grid overview`) to view all pages in a multi-column grid and jump directly to any page.
- **Minimap Navigator:** Quick viewport overview for panning across zoomed-in pages.
- **Performance for Massive Notebooks (100+ Pages):** Off-screen pages automatically release their canvas memory via `PageVirtualizer`, while active pages use `PageBackingCache` and `PageSpatialIndex` for fast redraws and hit-testing.

---

## 📑 PDF Import & Multi-Format Export

### PDF Import & Annotation
- Right-click any `.pdf` in the Obsidian File Explorer and choose **Import PDF as notebook**.
- Drag and drop a local PDF file or a `[[linked.pdf]]` from Obsidian directly onto a notebook page or the scroller.
- Or use the Command Palette: **`NotePages: Import PDF`** (append into current notebook) / **`NotePages: Import PDF as new notebook`**.
- PDF pages render as crisp background layers—annotate freely with pens, highlighters, shapes, text boxes, and sticky notes.

### Multi-Format Export
Open via the **Export** toolbar button or **`NotePages: Export notebook`**:
- **Formats:**
  - **PDF (`PdfExporter`):** Vector strokes and text layered cleanly over templates and imported PDF backgrounds.
  - **PNG (`PngExporter`):** Raster export at **1x (72 DPI)**, **2x (144 DPI)**, or **4x (300 DPI)**.
  - **SVG (`SvgExporter`):** Clean vector SVG files ready for Figma, Illustrator, or Inkscape.
- **Page Ranges:** Export **All Pages**, **Current Page**, or a **Custom Range** (e.g., `1, 3-5, 8`).
- **Destinations:** Save directly into your Obsidian Vault or download to disk.

---

## ⌨️ Shortcuts & Gestures

All keyboard shortcuts are **fully customizable** in **Settings → NotePages → Keyboard shortcuts** (with conflict detection and one-click reset).

### Default Tools
| Shortcut | Action |
| :--- | :--- |
| `P` | Pen |
| `G` | Pencil |
| `H` | Highlighter |
| `E` | Eraser |
| `L` | Lasso select |
| `V` | Pan / hand tool |
| `S` | Shapes |
| `C` | Line / connector |
| `N` | Sticky note |
| `T` | Text box |
| `I` | Insert image |

### Editing & Selection
| Shortcut | Action |
| :--- | :--- |
| `Ctrl/Cmd + Z` | Undo (strokes, shapes, edits, transforms, page changes) |
| `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y` | Redo |
| `Ctrl/Cmd + C` / `Ctrl/Cmd + V` | Copy / Paste selected elements |
| `Ctrl/Cmd + D` | Duplicate selection |
| `Delete` / `Backspace` | Delete active selection or selected image |
| `[` / `]` | Decrease / Increase stroke width |
| `Esc` | Clear selection / deselect |

### Canvas, Ruler & Pages
| Shortcut / Gesture | Action |
| :--- | :--- |
| `U` | Toggle ruler straightedge guide |
| `F` | Toggle focus mode (collapse toolbar) |
| `B` | Toggle pages sidebar |
| `A` | Add new page below current page |
| `R` | Toggle page orientation (Portrait / Landscape) |
| `F2` | Quick rename notebook |
| `=` / `-` / `0` | Zoom in / Zoom out / Reset zoom (100%) |
| `Space` + Drag / **Middle Mouse Drag** / **Right Mouse Drag** | Pan canvas |
| `Ctrl/Cmd` + **Scroll Wheel** / **2-Finger Pinch** | Cursor-anchored smooth zoom (`40%–300%`) |
| **1-Finger Drag** *(Touch)* | Pan canvas (when *Draw with finger* is off) |
| **2-Finger Tap** / **3-Finger Tap** *(Touch)* | Undo / Redo (configurable in Settings) |
| **Right-click Canvas** | Open Canvas Context Menu (add text, sticky note, image, PDF, page, rename, export) |

### Command Palette Commands
- `NotePages: Create new notebook`
- `NotePages: Toggle between notebook and Markdown view`
- `NotePages: Open page grid overview`
- `NotePages: Insert text box` / `Insert sticky note` / `Insert image`
- `NotePages: Import PDF` / `Import PDF as new notebook`
- `NotePages: Export notebook`
- `NotePages: Quick rename notebook`
- `NotePages: Submit feedback or feature request` / `Report an issue on GitHub`
- Plus tool-switching, zoom, sidebar, ruler, and focus mode commands.

---

## ⚙️ Settings & Customization

Open **Obsidian Settings → Community Plugins → NotePages** (with built-in setting search and dedicated subpages for General settings & Keyboard shortcuts):

### Paper & Notebook Defaults
| Setting | Options / Range | Description |
| :--- | :--- | :--- |
| **Default page size** | `A4`, `A3`, `A5`, `B5`, `Letter`, `16:9`, `Square`, `Custom` | Paper dimensions for newly created notebooks and pages. |
| **Default page orientation** | `Portrait`, `Landscape` | Vertical or horizontal layout for new pages. |
| **Default paper template** | `Ruled`, `Grid`, `Dotted`, `Cornell`, `Blank` | Background pattern rendered on new pages. |
| **Default paper background** | Color picker | Base stationery color (e.g., white, cream, or dark paper). |
| **Default line color** | Color picker | Color for rule lines, grids, and dots. |
| **Default line spacing (pt)** | `12` to `64` | Distance between lines, grid cells, or dots. |

### Drawing, Stylus & Touch
| Setting | Options / Range | Description |
| :--- | :--- | :--- |
| **Default tool** | `Pressure Pen`, `Pencil`, `Highlighter`, `Lasso Select`, `Pan / Hand` | Tool automatically selected when opening a notebook. |
| **Default pen color** | Color picker | Initial ink color when opening a notebook. |
| **Default pen width (pt)** | `0.5` to `15` | Initial pen stroke width. |
| **Default highlighter width (pt)** | `4` to `36` | Initial highlighter stroke width. |
| **Default eraser mode** | `Stroke eraser`, `Precision eraser` | Delete entire intersecting strokes or trim exact contact points. |
| **Default eraser size (px)** | `4` to `50` | Initial eraser radius. |
| **Auto-recognize shapes** | Toggle (`On` / `Off`) | Hold briefly at stroke end to snap into clean geometric shapes. |
| **Show pen nib hover preview** | Toggle (`On` / `Off`) | Show size and color preview ring under the cursor/stylus. |
| **Draw with finger** | Toggle (`On` / `Off`) | Allow finger drawing on touchscreens (turn off for palm rejection). |
| **Two-finger tap undo & three-finger tap redo** | Toggle (`On` / `Off`) | Quick multi-finger tap gestures for Undo/Redo on touchscreens. |
| **Palm rejection delay (ms)** | `0` to `1000` | Window after pen input during which stray finger touches are ignored. |
| **Stylus side button** | `Hold to erase`, `Toggle eraser on press`, `Disabled` | Map stylus barrel button to the eraser (use **Toggle** on Samsung S Pen / Android). |

### Toolbar & Workspace
| Setting | Options / Range | Description |
| :--- | :--- | :--- |
| **Toolbar placement** | `Top`, `Bottom`, `Left`, `Right` | Fixed edge position inside the notebook view (also changeable by dragging the grip handle). |
| **Dim toolbar while drawing** | Toggle (`On` / `Off`) | Lower toolbar opacity during active strokes. |
| **Show notebook title / zoom controls** | Toggles (`On` / `Off`) | Show or hide the title pill and zoom stepper on the toolbar. |
| **Autosave interval (ms)** | `>= 300` | Debounce delay before writing updates safely to disk. |
| **Reset toolbar layout / pen presets** | Action buttons | Restore default toolbar placement/visibility or quick pen presets. |

---

## ❓ Frequently Asked Questions

<details>
<summary><b>Where are my notebooks stored and is my data safe?</b></summary>
Every notebook is saved locally in your Obsidian Vault as a <code>.gnote</code> file using a versioned JSON schema with Obsidian frontmatter. Saves are serialized through a mutex queue with structural validation and automatic emergency backup protection if corruption is ever detected.
</details>

<details>
<summary><b>Can I inspect or edit the raw file as Markdown/JSON?</b></summary>
Yes. Run <code>NotePages: Toggle between notebook and Markdown view</code> from the Command Palette at any time to switch between the canvas view and the underlying source file.
</details>

<details>
<summary><b>How does NotePages handle large notebooks (100+ pages)?</b></summary>
NotePages uses viewport virtualization (<code>PageVirtualizer</code>), off-screen canvas deallocation, incremental active-stroke prefix caching, page backing caches, and spatial indexing (<code>PageSpatialIndex</code>) so scrolling, drawing, and erasing remain responsive even in large PDFs and multi-hundred-page notebooks.
</details>

<details>
<summary><b>Does NotePages work on iPad and Android tablets?</b></summary>
Yes! NotePages runs on Obsidian Mobile for iPadOS (Apple Pencil pressure & tilt) and Android tablets (Samsung S Pen). On Android tablets, set <b>Stylus side button</b> to <b>Toggle eraser on press</b> in Settings for reliable button erasing.
</details>

---

## 💬 Feedback & Community

- 📝 **[User Feedback & Feature Survey](https://docs.google.com/forms/d/e/1FAIpQLSeP3GLlOFJzvoTfJ4lVFXmvIGDNLdk_NyyQ909papxkeJXL9g/viewform)**: Share feature requests or feedback directly with the developer.
- 💬 **[GitHub Discussions](https://github.com/0xKurian/Obsinotes/discussions)**: Discuss workflows, templates, and ideas.
- 🐛 **[GitHub Issue Tracker](https://github.com/0xKurian/Obsinotes/issues)**: Report bugs with device/OS and reproduction steps.

---

## 🛠️ Development & Building

```bash
# Clone the repository
git clone https://github.com/0xKurian/Obsinotes.git
cd Obsinotes

# Install dependencies
npm install

# Run ESLint (Obsidian plugin rules)
npm run lint

# Run TypeScript type check
npm run typecheck

# Run automated test suite (246 unit & integration tests)
npm test

# Build production bundle (main.js)
npm run build
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).  
Created and maintained with ❤️ by **[Vinh-Hung](https://github.com/0xKurian)**.

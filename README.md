<div align="center">

# 📓 NotePages

**The modern, high-performance digital notebook and handwritten whiteboard for [Obsidian](https://obsidian.md).**

[![Obsidian Target](https://img.shields.io/badge/Obsidian-v1.5.12+-purple?logo=obsidian&style=flat-square)](https://obsidian.md)
[![Version](https://img.shields.io/badge/Version-1.2.1-blue?style=flat-square)](https://github.com/0xKurian/Obsinotes/releases)
[![Tests](https://img.shields.io/badge/Tests-178%20Passed-brightgreen?style=flat-square)](https://github.com/0xKurian/Obsinotes)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)

[Quick Start](#-quick-start-in-60-seconds) • [Core Features](#-core-features) • [Shortcuts & Gestures](#-shortcuts--gestures) • [PDF Annotation](#-pdf-import--annotation) • [Configuration](#-settings--customization) • [Feedback & Community](#-feedback--community)

</div>

---

## 🌟 Why NotePages?

**NotePages** bridges the gap between structured Markdown note-taking and the fluid freedom of physical pen-and-paper. Designed from the ground up for students, researchers, visual thinkers, and professionals, it brings a rich, dedicated multi-page digital notebook workflow natively into your Obsidian Vault with **100% offline local privacy**.

> [!NOTE]
> All drawings, sticky notes, formulas, and pages are stored as clean JSON files inside your vault with the `.gnote` extension. Your data remains completely yours—no external cloud dependencies, no tracking, and no proprietary lock-in.

---

## 🚀 Quick Start in 60 Seconds

### Step 1: Create a Notebook
- Click the **Book Icon** (`NotePages: New notebook`) in your Obsidian left Ribbon.
- Alternatively, press `Ctrl/Cmd + P` and search for `NotePages: Create new notebook`.
- You can also right-click any folder in the File Explorer and choose **New notebook**.

### Step 2: Choose Your Paper Template
- Use the **Top Toolbar** to switch between **Blank**, **Ruled (Lined)**, **Grid**, **Dotted**, or **Cornell** templates.
- Adjust line spacing and background colors to match your favorite stationery.

### Step 3: Ink, Type, and Sketch
- Pick a pen tool (Ballpoint, Pressure Pen, Fountain Pen, or Highlighter).
- Draw shapes and hold for **350ms**—they will snap automatically into clean geometry.
- Double-click anywhere to insert a rich **Text Box**, or click the **Sticky Note** icon for pastel notes.
- Type LaTeX formulas directly with `$...$` or `$$...$$`.

### Step 4: Export & Share
- Click the **Export** icon in the toolbar or open the Command Palette and type `NotePages: Export notebook`.
- Export individual pages or entire notebooks to print-ready **PDF**, high-resolution **PNG (up to 300 DPI)**, or vector **SVG**.

---

## 🎨 Core Features

### 1. High-Precision Stylus & Inking Engine
- **Hardware-Accelerated Strokes**: Powered by `perfect-freehand` with 60–120 FPS render loops using `requestAnimationFrame`. Zero perceptible stroke latency.
- **Natural Pen Tools**:
  - **Ballpoint Pen**: Crisp, uniform lines ideal for fast writing and technical drawings.
  - **Pressure-Sensitive Pen**: Responds realistically to stylus pressure on Apple Pencil, Surface Pen, and Wacom styluses.
  - **Fountain Pen**: Dynamic velocity and calligraphic thinning for expressive handwriting.
  - **Authentic Highlighter**: Uses canvas `multiply` blend mode so bright highlights layer softly without washing out text or underlying handwriting.
- **Accurate Dot Inking**: Sensitive micro-tap detection ensures i-dots, periods, and commas register reliably.
- **Dual Eraser Engine**:
  - **Stroke Eraser**: Deletes entire intersecting strokes and geometric shapes with a single tap.
  - **Precision Eraser**: Trims and cuts strokes at the exact touch radius for precision corrections.

### 2. Smart Shapes & Connectors
- **Hold-to-Snap Recognition**: Scribble a line, circle, ellipse, rectangle, triangle, or arrow and pause for 350ms—NotePages snaps it into a mathematically perfect shape.
- **Dedicated Shape Palette**: Quickly drop predefined geometric shapes with custom stroke width, border colors, and optional solid fills.
- **Smart Connectors**: Draw linking arrows and lines between diagrams with live snap endpoints.
- **Eraser Compatibility**: The eraser tool deletes both freehand drawings and geometric shapes seamlessly.

### 3. Sticky Notes, Rich Text & LaTeX Math
- **Pastel Sticky Notes**: Color-coded notes with soft drop shadows, drag-to-resize bounds, and multi-line text editing.
- **Rich Text Boxes**: Floating text containers with adjustable font sizes, alignment, font families, and markdown styling.
- **Native LaTeX Formulas**: Write inline math `$\int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}$` or display blocks `$$E = mc^2$$` with automatic MathJax/KaTeX rendering.
- **Obsidian Wikilinks**: Type `[[My Other Note]]` inside any text box or sticky note. Click to navigate, or hover with `Ctrl/Cmd` for native Obsidian popover previews.

### 4. Continuous Multi-Page Workspace
- **Seamless Vertical Scrolling**: Pages flow smoothly from top to bottom just like an endless paper binder.
- **Page Thumbnail Sidebar**: An interactive side drawer displaying real-time miniature renderings of your strokes, sticky notes, texts, and images.
- **Safe Page Management**: Add, duplicate, reorder, or delete pages with full **Undo / Redo (`Ctrl+Z` / `Ctrl+Y`)** protection—never lose work from an accidental deletion.
- **Smart Memory Virtualization**: Large notebooks (50–100+ pages) cull off-screen canvases from memory, guaranteeing fast performance and minimal RAM usage.

### 5. Smooth Touchpad & Touch Gestures
- **Cursor-Anchored Zooming**: Smooth trackpad pinch-to-zoom keeps the exact point under your cursor fixed in place.
- **Palm Rejection**: Dedicated drawing engine ignores palm touches when using an active stylus. Toggle **Draw with finger** in Settings if you prefer finger sketching.

---

## 📑 PDF Import & Annotation

Turn any existing PDF into an annotated digital notebook:

1. Right-click any PDF in your Obsidian Vault file explorer and select **Import PDF as notebook**.
2. Or use the Command Palette: `NotePages: Import PDF as new notebook`.
3. NotePages renders each PDF page as an immutable, crisp background canvas.
4. Highlight passages, take margin notes, insert sticky notes, or draw diagrams on top of the original document.
5. Export back to vector PDF with all your annotations layered over the original pages.

---

## ⌨️ Shortcuts & Gestures

### Drawing & Inking
| Shortcut | Action |
| :--- | :--- |
| `P` | Switch to Pen tool |
| `H` | Switch to Highlighter tool |
| `E` | Switch to Eraser tool |
| `S` | Open Shape Palette |
| `C` | Switch to Connector Line/Arrow tool |
| `L` | Switch to Lasso Selection tool |
| `T` | Insert Rich Text Box |
| `N` | Insert Sticky Note |
| `[` / `]` | Decrease / Increase stroke width |
| **Stylus Hold (~350ms)** | Snap freehand stroke into perfect geometric shape |

### Canvas Navigation
| Gesture / Shortcut | Action |
| :--- | :--- |
| `Space` + Drag | Pan across canvas workspace |
| **Middle Mouse Drag** | Pan canvas |
| **1-Finger Drag (Touch)** | Pan canvas (when *Draw with finger* is disabled) |
| `Ctrl` / `Cmd` + **Scroll Wheel** | Smooth zoom centered on mouse cursor |
| **2-Finger Trackpad Pinch** | Continuous zoom centered on mouse focal point |

### Selection & Editing
| Shortcut | Action |
| :--- | :--- |
| `Ctrl/Cmd + Z` | Undo last stroke, shape, transform, or page deletion |
| `Ctrl/Cmd + Y` *(or `Shift+Ctrl+Z`)* | Redo last undone action |
| `Ctrl/Cmd + C` | Copy selected strokes, shapes, sticky notes, and text |
| `Ctrl/Cmd + V` | Paste copied elements onto active page |
| `Ctrl/Cmd + D` | Duplicate selection immediately |
| `Delete` / `Backspace` | Delete active selection |

### Page Management
| Shortcut | Action |
| :--- | :--- |
| `A` | Add new page directly below the current page |
| **Right-click Canvas** | Open Canvas Context Menu (Add page, insert text/sticky, rename) |
| **Double-click Title** | Quick rename notebook modal |

---

## ⚙️ Settings & Customization

Access settings via **Obsidian Settings → Community Plugins → NotePages**:

| Setting | Options | Description |
| :--- | :--- | :--- |
| **Default page size** | `A4`, `Letter` | Paper dimensions applied to newly created notebooks. |
| **Default page orientation** | `Portrait`, `Landscape` | Vertical or horizontal page layout. |
| **Default paper template** | `Ruled`, `Grid`, `Dotted`, `Cornell`, `Blank` | Pattern rendered onto page backgrounds. |
| **Default paper background** | Color Picker (e.g. `#ffffff`, `#fefae0`) | Base stationery color for new pages. |
| **Default line color** | Color Picker (e.g. `#94a3b8`) | Contrast color for rules, grids, and dots. |
| **Default line spacing (pt)** | Slider / Number (12 to 64 pt) | Grid size or line distance between rules. |
| **Draw with finger** | Toggle (`On` / `Off`) | Allow drawing with fingertips on touchscreens (disable for palm rejection). |
| **Autosave interval (ms)** | Number (min 300ms) | Background debounce delay before writing changes to disk. |
| **Custom feedback form URL** | Text URL | Custom URL for feedback. Defaults to the official survey. |

---

## 📤 Multi-Format Export Engine

Export your work anytime without quality loss via **Toolbar → Export icon** or `Ctrl/Cmd + P` → `NotePages: Export notebook`:

```
┌────────────────────────────────────────────────────────┐
│                   NotePages Exporter                   │
├────────────────────────────────────────────────────────┤
│ Format:      [ PDF Document ]  [ PNG Images ]  [ SVG ] │
│ Resolution:  [ 1x (72 DPI)  ]  [ 2x (144) ]  [ 4x(300)]│
│ Range:       (•) All Pages     ( ) Current   ( ) Custom│
│ Destination: (•) Save to Vault ( ) Download to Disk    │
└────────────────────────────────────────────────────────┘
```

- **Vector PDF**: Preserves crisp strokes and embeds original PDF backgrounds.
- **Ultra HD PNG**: Export at 300 DPI (4x) for high-resolution printing or slide presentations.
- **Vector SVG**: Exports pure SVG code for editing in Illustrator, Inkscape, or Figma.

---

## 💬 Feedback & Community

Your feedback shapes the future of NotePages! We would love to hear your thoughts, feature requests, or bug reports:

- 📝 **[User Feedback & Feature Survey](https://docs.google.com/forms/d/e/1FAIpQLSeP3GLlOFJzvoTfJ4lVFXmvIGDNLdk_NyyQ909papxkeJXL9g/viewform)**: Quick 1-minute feedback form directly reviewed by the developer.
- 💬 **[GitHub Discussions](https://github.com/0xKurian/Obsinotes/discussions)**: Share your notes, discuss workflows, or ask questions.
- 🐛 **[GitHub Issue Tracker](https://github.com/0xKurian/Obsinotes/issues)**: Report bugs or technical issues with reproducible details.

---

## ❓ Frequently Asked Questions

<details>
<summary><b>Where are my drawings and notebooks stored?</b></summary>
Everything is saved as plain JSON files with a <code>.gnote</code> extension directly in your Obsidian Vault. You can backup, sync (via Obsidian Sync, Git, or iCloud), and copy them just like standard markdown notes.
</details>

<details>
<summary><b>Can I view the raw markdown / JSON data?</b></summary>
Yes. Run <code>NotePages: Toggle between notebook and Markdown view</code> from the Command Palette to view or edit the underlying notebook schema.
</details>

<details>
<summary><b>How does NotePages perform with notebooks containing 100+ pages?</b></summary>
NotePages includes an automatic viewport virtualizer. Only pages currently visible in the scroll viewport (plus a 1-page safety buffer) keep their canvas contexts in memory. Off-screen canvases are deallocated, keeping memory consumption low even in massive documents.
</details>

<details>
<summary><b>Does NotePages work on tablets (iPad / Android)?</b></summary>
Yes! NotePages runs on Obsidian Mobile for iPadOS (with Apple Pencil pressure support) and Android tablets (with Samsung S-Pen support).
</details>

---

## 🛠️ Development & Building

```bash
# Clone the repository
git clone https://github.com/0xKurian/Obsinotes.git
cd Obsinotes

# Install dependencies
npm install

# Run TypeScript type check
npm run typecheck

# Run linter
npm run lint

# Run automated test suite (178 unit & integration tests)
npm test

# Build production bundle
npm run build
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).  
Created and maintained with ❤️ by **[Vinh-Hung](https://github.com/0xKurian)**.

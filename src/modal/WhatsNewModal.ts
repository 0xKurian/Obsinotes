import { App, Modal } from "obsidian";
import type { ChangelogEntry } from "../changelog/ChangelogData";
import { RELEASES_URL, openSafeExternalUrl } from "../settings/NotePagesSettings";

export type WhatsNewModalMode = "welcome" | "update" | "changelog";

export class WhatsNewModal extends Modal {
  private readonly entries: readonly ChangelogEntry[];
  private readonly currentVersion: string;
  private readonly mode: WhatsNewModalMode;

  constructor(
    app: App,
    entries: readonly ChangelogEntry[],
    currentVersion: string,
    mode: WhatsNewModalMode = "update"
  ) {
    super(app);
    this.entries = entries;
    this.currentVersion = currentVersion;
    this.mode = mode;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("notepages-whats-new-modal");

    const headerEl = contentEl.createDiv({ cls: "notepages-whats-new-header" });
    headerEl.createEl("h2", {
      cls: "notepages-whats-new-title",
      text: this.getTitleText()
    });
    headerEl.createEl("p", {
      cls: "notepages-whats-new-subtitle",
      text: this.getSubtitleText()
    });

    const bodyEl = contentEl.createDiv({ cls: "notepages-whats-new-body" });

    if (this.mode === "welcome") {
      this.renderWelcomeGuide(bodyEl);
    }

    if (this.entries.length === 0) {
      bodyEl.createEl("p", {
        cls: "notepages-whats-new-empty",
        text: "No release notes available."
      });
    } else {
      if (this.mode === "welcome") {
        bodyEl.createEl("h3", {
          cls: "notepages-whats-new-section-heading",
          text: "Latest release"
        });
      }
      for (const entry of this.entries) {
        this.renderEntry(bodyEl, entry);
      }
    }

    const footerEl = contentEl.createDiv({ cls: "notepages-whats-new-footer" });

    const historyBtn = footerEl.createEl("button", {
      cls: "notepages-whats-new-history-btn",
      text: "Full release history"
    });
    historyBtn.setAttribute("type", "button");
    historyBtn.addEventListener("click", () => {
      openSafeExternalUrl(RELEASES_URL, RELEASES_URL);
    });

    const closeBtn = footerEl.createEl("button", {
      cls: "mod-cta",
      text: this.mode === "welcome" ? "Get started" : "Got it"
    });
    closeBtn.setAttribute("type", "button");
    closeBtn.addEventListener("click", () => {
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private getTitleText(): string {
    if (this.mode === "welcome") {
      return `Welcome to NotePages v${this.currentVersion}`;
    }
    if (this.mode === "changelog") {
      return "NotePages release notes";
    }
    return `What's new in NotePages v${this.currentVersion}`;
  }

  private getSubtitleText(): string {
    if (this.mode === "welcome") {
      return "Create multi-page digital notebooks and whiteboards with stylus inking, paper templates, sticky notes, LaTeX math, and continuous scrolling.";
    }
    if (this.mode === "changelog") {
      return `Installed version: v${this.currentVersion}`;
    }
    return this.entries.length > 1
      ? `Summary of changes across ${this.entries.length} releases up to v${this.currentVersion}.`
      : `Here is what changed in v${this.currentVersion}.`;
  }

  private renderWelcomeGuide(container: HTMLElement): void {
    const guideEl = container.createDiv({ cls: "notepages-whats-new-welcome-box" });
    guideEl.createEl("h3", {
      cls: "notepages-whats-new-section-heading",
      text: "Quick start"
    });
    const listEl = guideEl.createEl("ul", { cls: "notepages-whats-new-list" });
    const steps = [
      'Click the notebook icon in the left ribbon or run "Create new notebook" from the Command Palette.',
      "Write with a stylus or mouse, insert sticky notes and LaTeX math, or import PDFs as backgrounds.",
      "Customize paper defaults, stylus options, hotkeys, and release note alerts anytime in Settings."
    ];
    for (const step of steps) {
      listEl.createEl("li", { text: step });
    }
  }

  private renderEntry(container: HTMLElement, entry: ChangelogEntry): void {
    const entryEl = container.createDiv({ cls: "notepages-whats-new-entry" });

    const metaEl = entryEl.createDiv({ cls: "notepages-whats-new-entry-header" });
    metaEl.createSpan({
      cls: "notepages-whats-new-version-badge",
      text: `v${entry.version}`
    });
    if (entry.date) {
      metaEl.createSpan({
        cls: "notepages-whats-new-date",
        text: entry.date
      });
    }

    if (entry.highlights.length > 0) {
      entryEl.createDiv({
        cls: "notepages-whats-new-group-label",
        text: "Highlights"
      });
      const highlightsList = entryEl.createEl("ul", { cls: "notepages-whats-new-list" });
      for (const item of entry.highlights) {
        highlightsList.createEl("li", { text: item });
      }
    }

    if (entry.fixes && entry.fixes.length > 0) {
      entryEl.createDiv({
        cls: "notepages-whats-new-group-label",
        text: "Fixes"
      });
      const fixesList = entryEl.createEl("ul", { cls: "notepages-whats-new-list" });
      for (const item of entry.fixes) {
        fixesList.createEl("li", { text: item });
      }
    }
  }
}

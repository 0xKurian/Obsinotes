import { App, Modal } from "obsidian";

export interface RenameValidationResult {
  valid: boolean;
  error?: string;
  sanitizedTitle?: string;
}

/**
 * Validates a proposed notebook title against filesystem rules and existing siblings.
 */
export function validateNotebookTitle(
  rawTitle: string,
  existingFileNames: string[] = [],
  currentTitle?: string
): RenameValidationResult {
  let trimmed = rawTitle.trim();
  if (trimmed.toLowerCase().endsWith(".gnote")) {
    trimmed = trimmed.substring(0, trimmed.length - 6).trim();
  }

  if (trimmed.length === 0) {
    return { valid: false, error: "Notebook title cannot be empty." };
  }

  if (trimmed.startsWith(".")) {
    return { valid: false, error: "Title cannot start with a dot (.)" };
  }

  // Windows / Linux / macOS illegal filename characters: / \ : * ? " < > |
  const illegalCharsRegex = /[\\/:*?"<>|]/;
  if (illegalCharsRegex.test(trimmed)) {
    return {
      valid: false,
      error: 'Title cannot contain illegal characters: / \\ : * ? " < > |'
    };
  }

  if (trimmed.length > 250) {
    return { valid: false, error: "Title cannot exceed 250 characters." };
  }

  const normalizedCurrent = currentTitle?.trim().toLowerCase();
  const normalizedNew = trimmed.toLowerCase();

  if (normalizedCurrent && normalizedNew === normalizedCurrent) {
    return { valid: true, sanitizedTitle: trimmed };
  }

  if (existingFileNames.map((n) => n.toLowerCase()).includes(normalizedNew)) {
    return {
      valid: false,
      error: `A file named "${trimmed}" already exists in this folder.`
    };
  }

  return { valid: true, sanitizedTitle: trimmed };
}

export class QuickRenameModal extends Modal {
  private currentTitle: string;
  private existingFileNames: string[];
  private onRename: (newTitle: string) => Promise<boolean | void>;
  private inputEl!: HTMLInputElement;
  private errorEl!: HTMLElement;
  private submitBtn!: HTMLButtonElement;

  constructor(
    app: App,
    currentTitle: string,
    existingFileNames: string[],
    onRename: (newTitle: string) => Promise<boolean | void>
  ) {
    super(app);
    this.currentTitle = currentTitle;
    this.existingFileNames = existingFileNames;
    this.onRename = onRename;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("notepages-rename-modal");

    contentEl.createEl("h3", { text: "Quick rename notebook" });
    contentEl.createEl("p", {
      cls: "notepages-rename-desc",
      text: "Enter a new name for this notebook:"
    });

    const formGroup = contentEl.createDiv({ cls: "notepages-rename-form-group" });

    this.inputEl = formGroup.createEl("input", {
      type: "text",
      cls: "notepages-rename-input",
      value: this.currentTitle
    });
    this.inputEl.placeholder = "Notebook title...";

    this.errorEl = formGroup.createDiv({
      cls: "notepages-rename-error"
    });

    const buttonGroup = contentEl.createDiv({
      cls: "notepages-rename-actions"
    });

    const cancelBtn = buttonGroup.createEl("button", {
      text: "Cancel"
    });
    cancelBtn.addEventListener("click", () => {
      this.close();
    });

    this.submitBtn = buttonGroup.createEl("button", {
      cls: "mod-cta",
      text: "Rename"
    });
    this.submitBtn.addEventListener("click", () => {
      void this.handleSubmit();
    });

    this.inputEl.addEventListener("input", () => {
      this.validateCurrentInput();
    });

    this.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void this.handleSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    });

    // Auto-focus and select all text
    window.setTimeout(() => {
      this.inputEl.focus();
      this.inputEl.select();
    }, 50);
  }

  private validateCurrentInput(): boolean {
    const value = this.inputEl.value;
    const validation = validateNotebookTitle(value, this.existingFileNames, this.currentTitle);
    if (!validation.valid) {
      this.errorEl.setText(validation.error || "Invalid title");
      this.errorEl.addClass("is-visible");
      this.submitBtn.disabled = true;
      return false;
    } else {
      this.errorEl.setText("");
      this.errorEl.removeClass("is-visible");
      this.submitBtn.disabled = false;
      return true;
    }
  }

  private async handleSubmit(): Promise<void> {
    if (!this.validateCurrentInput()) {
      return;
    }
    const validation = validateNotebookTitle(this.inputEl.value, this.existingFileNames, this.currentTitle);
    const sanitizedTitle = validation.sanitizedTitle || this.inputEl.value.trim();

    if (sanitizedTitle === this.currentTitle) {
      this.close();
      return;
    }

    this.submitBtn.disabled = true;
    try {
      const result = await this.onRename(sanitizedTitle);
      if (result !== false) {
        this.close();
      }
    } finally {
      this.submitBtn.disabled = false;
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

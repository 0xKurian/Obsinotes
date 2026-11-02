import type { TFile } from "obsidian";
import { DocumentSerializer } from "./DocumentSerializer";
import { EmergencyBackupInfo, NotebookDocument } from "../types";

export function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}

export interface IVaultLike {
  modify(file: TFile, data: string): Promise<void>;
  read(file: TFile): Promise<string>;
  adapter: {
    exists(path: string): Promise<boolean>;
    write(path: string, data: string): Promise<void>;
    mkdir?(path: string): Promise<void>;
  };
}

interface PendingSave {
  doc: NotebookDocument;
  resolve: () => void;
  reject: (err: unknown) => void;
}

export class StorageManager {
  private vault: IVaultLike;
  private corruptedFiles = new Set<string>();
  private activeSaves = new Map<string, Promise<void>>();
  private pendingSaves = new Map<string, PendingSave>();

  constructor(vault: IVaultLike) {
    this.vault = vault;
  }

  markCorrupted(filePath: string): void {
    this.corruptedFiles.add(filePath);
  }

  clearCorrupted(filePath: string): void {
    this.corruptedFiles.delete(filePath);
  }

  isCorrupted(filePath: string): boolean {
    return this.corruptedFiles.has(filePath);
  }

  async saveDocument(file: TFile, doc: NotebookDocument): Promise<void> {
    if (this.isCorrupted(file.path)) {
      throw new Error("Saving blocked: file is corrupted and protected from overwrite.");
    }

    const validation = DocumentSerializer.validateDocument(doc);
    if (!validation.valid) {
      const serialized = DocumentSerializer.serializeDocument(doc);
      await this.createEmergencyBackup(file, serialized);
      throw new Error(`Document validation failed before write: ${validation.errors.join("; ")}`);
    }

    return new Promise<void>((resolve, reject) => {
      const existingPending = this.pendingSaves.get(file.path);
      if (existingPending) {
        existingPending.resolve();
      }
      this.pendingSaves.set(file.path, { doc, resolve, reject });
      this.processQueue(file);
    });
  }

  private processQueue(file: TFile): void {
    if (this.activeSaves.has(file.path)) {
      return;
    }

    const pending = this.pendingSaves.get(file.path);
    if (!pending) {
      return;
    }

    this.pendingSaves.delete(file.path);

    const content = DocumentSerializer.serializeDocument(pending.doc);
    const savePromise = this.vault
      .modify(file, content)
      .then(() => {
        pending.resolve();
      })
      .catch((err: unknown) => {
        pending.reject(err);
      })
      .finally(() => {
        this.activeSaves.delete(file.path);
        if (this.pendingSaves.has(file.path)) {
          this.processQueue(file);
        }
      });

    this.activeSaves.set(file.path, savePromise);
  }

  async createEmergencyBackup(file: TFile, content: string): Promise<EmergencyBackupInfo> {
    const timestamp = Date.now();
    const backupDir = ".notepages-backup";
    const backupPath = normalizeVaultPath(`${backupDir}/${file.basename}.${timestamp}.backup`);

    try {
      if (this.vault.adapter) {
        const dirExists = await this.vault.adapter.exists(backupDir);
        if (!dirExists && this.vault.adapter.mkdir) {
          await this.vault.adapter.mkdir(backupDir);
        }
        await this.vault.adapter.write(backupPath, content);
      }
    } catch {
    }

    return {
      backupPath,
      timestamp,
      originalPath: file.path
    };
  }

  resolveAttachmentPath(relativePath: string): string {
    return normalizeVaultPath(relativePath);
  }
}

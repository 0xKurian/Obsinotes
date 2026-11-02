import { describe, it } from "node:test";
import assert from "node:assert";
import { StorageManager, IVaultLike } from "../src/storage/StorageManager";
import { NotebookDocument, PageData } from "../src/types";
import type { TFile } from "obsidian";

describe("StorageManager", () => {
  function createMockFile(path: string): TFile {
    return {
      path,
      name: path.split("/").pop() || "test.gnote.md",
      basename: (path.split("/").pop() || "test").replace(/\.gnote\.md$/, ""),
      extension: "md"
    } as unknown as TFile;
  }

  function createValidDocument(title = "Safe Notebook"): NotebookDocument {
    const page: PageData = {
      id: "p1",
      pageNumber: 1,
      dimensions: { width: 595.28, height: 841.89, unit: "pt" },
      orientation: "portrait",
      template: {
        type: "ruled",
        backgroundColor: "#ffffff",
        lineColor: "#e2e8f0",
        spacing: 24,
        opacity: 0.8
      },
      strokes: [],
      shapes: [],
      texts: [],
      images: []
    };

    return {
      metadata: {
        title,
        createdAt: 1730000000,
        updatedAt: 1730000000,
        schemaVersion: 1,
        defaultPageSize: "A4",
        defaultOrientation: "portrait"
      },
      pages: [page]
    };
  }

  function createMockVault(): {
    vault: IVaultLike;
    modifiedFiles: Map<string, string>;
    writtenBackups: Map<string, string>;
    createdFolders: Set<string>;
  } {
    const modifiedFiles = new Map<string, string>();
    const writtenBackups = new Map<string, string>();
    const createdFolders = new Set<string>();

    const vault: IVaultLike = {
      async modify(file: TFile, data: string): Promise<void> {
        modifiedFiles.set(file.path, data);
      },
      async read(file: TFile): Promise<string> {
        return modifiedFiles.get(file.path) || "";
      },
      adapter: {
        async exists(path: string): Promise<boolean> {
          return createdFolders.has(path) || writtenBackups.has(path);
        },
        async write(path: string, data: string): Promise<void> {
          writtenBackups.set(path, data);
        },
        async mkdir(path: string): Promise<void> {
          createdFolders.add(path);
        }
      }
    };

    return { vault, modifiedFiles, writtenBackups, createdFolders };
  }

  it("saves a valid document safely to vault", async () => {
    const { vault, modifiedFiles } = createMockVault();
    const storage = new StorageManager(vault);
    const file = createMockFile("notes/Math.gnote.md");
    const doc = createValidDocument("Math Notes");

    await storage.saveDocument(file, doc);

    assert.strictEqual(modifiedFiles.has("notes/Math.gnote.md"), true);
    const content = modifiedFiles.get("notes/Math.gnote.md")!;
    assert.ok(content.includes("Math Notes"));
    assert.ok(content.includes("```notepages-data"));
  });

  it("coalesces rapid successive saves and runs them sequentially via mutex queue", async () => {
    const modifiedHistory: Array<{ path: string; title: string }> = [];
    let resolveFirstModify: (() => void) | null = null;

    const vault: IVaultLike = {
      async modify(file: TFile, data: string): Promise<void> {
        if (!resolveFirstModify) {
          await new Promise<void>((r) => {
            resolveFirstModify = r;
          });
        }
        const match = data.match(/"title": "([^"]+)"/);
        modifiedHistory.push({
          path: file.path,
          title: match ? match[1] : ""
        });
      },
      async read(): Promise<string> {
        return "";
      },
      adapter: {
        async exists(): Promise<boolean> {
          return false;
        },
        async write(): Promise<void> {},
        async mkdir(): Promise<void> {}
      }
    };

    const storage = new StorageManager(vault);
    const file = createMockFile("notes/Physics.gnote.md");

    const p1 = storage.saveDocument(file, createValidDocument("V1"));
    const p2 = storage.saveDocument(file, createValidDocument("V2"));
    const p3 = storage.saveDocument(file, createValidDocument("V3"));

    if (resolveFirstModify) {
      (resolveFirstModify as () => void)();
    }

    await Promise.all([p1, p2, p3]);

    assert.strictEqual(modifiedHistory.length, 2);
    assert.strictEqual(modifiedHistory[0].title, "V1");
    assert.strictEqual(modifiedHistory[1].title, "V3");
  });

  it("blocks saving and protects file when marked corrupted", async () => {
    const { vault, modifiedFiles } = createMockVault();
    const storage = new StorageManager(vault);
    const file = createMockFile("notes/Corrupted.gnote.md");

    storage.markCorrupted(file.path);
    assert.strictEqual(storage.isCorrupted(file.path), true);

    await assert.rejects(
      async () => {
        await storage.saveDocument(file, createValidDocument());
      },
      {
        message: /Saving blocked: file is corrupted/
      }
    );

    assert.strictEqual(modifiedFiles.has(file.path), false);

    storage.clearCorrupted(file.path);
    assert.strictEqual(storage.isCorrupted(file.path), false);

    await storage.saveDocument(file, createValidDocument("Recovered"));
    assert.strictEqual(modifiedFiles.has(file.path), true);
  });

  it("aborts save and creates emergency backup when document validation fails", async () => {
    const { vault, modifiedFiles, writtenBackups } = createMockVault();
    const storage = new StorageManager(vault);
    const file = createMockFile("notes/Invalid.gnote.md");

    const invalidDoc = createValidDocument();
    (invalidDoc.metadata as Record<string, unknown>).defaultPageSize = "NonExistentPreset";

    await assert.rejects(
      async () => {
        await storage.saveDocument(file, invalidDoc);
      },
      {
        message: /Document validation failed before write/
      }
    );

    assert.strictEqual(modifiedFiles.has(file.path), false);
    assert.strictEqual(writtenBackups.size, 1);
    const backupKeys = Array.from(writtenBackups.keys());
    assert.ok(backupKeys[0].startsWith(".notepages-backup/Invalid."));
    assert.ok(backupKeys[0].endsWith(".backup"));
  });

  it("creates emergency backup directly", async () => {
    const { vault, writtenBackups, createdFolders } = createMockVault();
    const storage = new StorageManager(vault);
    const file = createMockFile("Biology.gnote.md");

    const backupInfo = await storage.createEmergencyBackup(file, "raw payload backup content");
    assert.ok(backupInfo.backupPath.includes(".notepages-backup/Biology."));
    assert.strictEqual(createdFolders.has(".notepages-backup"), true);
    assert.strictEqual(writtenBackups.get(backupInfo.backupPath), "raw payload backup content");
  });

  it("resolves attachment relative path cleanly", () => {
    const { vault } = createMockVault();
    const storage = new StorageManager(vault);
    const resolved = storage.resolveAttachmentPath("attachments/images/diagram.png");
    assert.strictEqual(resolved, "attachments/images/diagram.png");
  });
});

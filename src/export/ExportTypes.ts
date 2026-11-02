export type ExportFormat = "pdf" | "png" | "svg";

export type ExportPageRange = "all" | "current" | "custom";

export type ExportDestination = "vault" | "download";

export interface ExportOptions {
  format: ExportFormat;
  pageRange: ExportPageRange;
  customPageRange?: string;
  resolution: number;
  includeBackgroundTemplate: boolean;
  includePdfBackground: boolean;
  destination: ExportDestination;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: "pdf",
  pageRange: "all",
  resolution: 2,
  includeBackgroundTemplate: true,
  includePdfBackground: true,
  destination: "vault"
};

export function parsePageRange(
  range: ExportPageRange,
  customRange: string | undefined,
  totalPages: number,
  currentPage: number
): number[] {
  if (totalPages <= 0) {
    return [];
  }

  if (range === "current") {
    const validCurrent = Math.max(1, Math.min(currentPage, totalPages));
    return [validCurrent];
  }

  if (range === "all") {
    const pages: number[] = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }

  if (!customRange || customRange.trim().length === 0) {
    const pages: number[] = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }

  const result = new Set<number>();
  const tokens = customRange.split(",");

  for (const token of tokens) {
    const trimmed = token.trim();
    if (trimmed.includes("-")) {
      const parts = trimmed.split("-").map(p => parseInt(p.trim(), 10));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const start = Math.max(1, Math.min(parts[0], parts[1]));
        const end = Math.min(totalPages, Math.max(parts[0], parts[1]));
        for (let p = start; p <= end; p++) {
          result.add(p);
        }
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num >= 1 && num <= totalPages) {
        result.add(num);
      }
    }
  }

  if (result.size === 0) {
    return [1];
  }

  return Array.from(result).sort((a, b) => a - b);
}

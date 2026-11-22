import type { ChangelogEntry } from "./ChangelogData";

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export type UpdateCheckMode = "welcome" | "update" | "none";

export interface UpdateCheckResult {
  mode: UpdateCheckMode;
  entries: ChangelogEntry[];
  shouldPersistVersion: boolean;
}

export function isValidVersionString(value: unknown): value is string {
  return typeof value === "string" && VERSION_PATTERN.test(value.trim());
}

/**
 * Parse a semver-like string into numeric segments, ignoring any leading "v"
 * and any prerelease/build suffix (e.g. "-beta.1", "+build").
 */
export function parseVersionSegments(version: string): number[] {
  const cleaned = version.trim().replace(/^v/i, "").split(/[-+]/)[0] ?? "";
  if (!cleaned) {
    return [0];
  }
  return cleaned.split(".").map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
}

/**
 * Compare two semver-like version strings numerically.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareVersions(a: string, b: string): number {
  const segA = parseVersionSegments(a);
  const segB = parseVersionSegments(b);
  const maxLen = Math.max(segA.length, segB.length);
  for (let i = 0; i < maxLen; i += 1) {
    const numA = segA[i] ?? 0;
    const numB = segB[i] ?? 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

/**
 * Return changelog entries with version in (fromExclusive, toInclusive],
 * sorted in descending version order.
 */
export function getEntriesBetween(
  entries: readonly ChangelogEntry[],
  fromExclusive: string | null,
  toInclusive: string
): ChangelogEntry[] {
  return entries
    .filter((entry) => {
      if (compareVersions(entry.version, toInclusive) > 0) {
        return false;
      }
      if (fromExclusive !== null && compareVersions(entry.version, fromExclusive) <= 0) {
        return false;
      }
      return true;
    })
    .sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * Decide whether to show the Welcome modal, the What's New modal, or nothing
 * when the plugin loads.
 */
export function evaluateUpdateNotification(params: {
  hadPersistedSettingsData: boolean;
  lastSeenVersion: string | null;
  currentVersion: string;
  showWhatsNewOnUpdate: boolean;
  changelog: readonly ChangelogEntry[];
}): UpdateCheckResult {
  const {
    hadPersistedSettingsData,
    lastSeenVersion,
    currentVersion,
    showWhatsNewOnUpdate,
    changelog
  } = params;

  if (!isValidVersionString(currentVersion)) {
    return { mode: "none", entries: [], shouldPersistVersion: false };
  }

  // Fresh install: no persisted data.json existed yet.
  if (!hadPersistedSettingsData && lastSeenVersion === null) {
    const currentEntries = changelog.filter(
      (entry) => compareVersions(entry.version, currentVersion) === 0
    );
    return {
      mode: "welcome",
      entries: currentEntries.length > 0 ? currentEntries : changelog.slice(0, 1),
      shouldPersistVersion: true
    };
  }

  // Existing user upgrading from a version prior to lastSeenVersion tracking.
  if (hadPersistedSettingsData && lastSeenVersion === null) {
    const latestEntry = changelog.filter(
      (entry) => compareVersions(entry.version, currentVersion) === 0
    );
    const entries = latestEntry.length > 0 ? latestEntry : changelog.slice(0, 1);
    return {
      mode: showWhatsNewOnUpdate && entries.length > 0 ? "update" : "none",
      entries: showWhatsNewOnUpdate ? entries : [],
      shouldPersistVersion: true
    };
  }

  // Known previous version.
  if (lastSeenVersion !== null && compareVersions(currentVersion, lastSeenVersion) > 0) {
    const entries = showWhatsNewOnUpdate
      ? getEntriesBetween(changelog, lastSeenVersion, currentVersion)
      : [];
    return {
      mode: showWhatsNewOnUpdate && entries.length > 0 ? "update" : "none",
      entries,
      shouldPersistVersion: true
    };
  }

  return { mode: "none", entries: [], shouldPersistVersion: false };
}

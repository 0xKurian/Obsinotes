import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { CHANGELOG, type ChangelogEntry } from "../src/changelog/ChangelogData";
import {
  compareVersions,
  evaluateUpdateNotification,
  getEntriesBetween,
  isValidVersionString
} from "../src/changelog/VersionUtils";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../src/settings/NotePagesSettings";

const SAMPLE_CHANGELOG: ChangelogEntry[] = [
  { version: "2.0.16", date: "2026-11-22", highlights: ["Added What's New modal"] },
  { version: "2.0.15", date: "2026-11-22", highlights: ["Preserved frontmatter"] },
  { version: "2.0.14", date: "2026-11-20", highlights: ["Default #notepages tag"] },
  { version: "2.0.9", date: "2026-11-20", highlights: ["Inline properties panel"] }
];

describe("What's New & VersionUtils", () => {
  test("compareVersions compares numeric segments accurately", () => {
    assert.strictEqual(compareVersions("2.0.10", "2.0.9"), 1);
    assert.strictEqual(compareVersions("2.0.9", "2.0.10"), -1);
    assert.strictEqual(compareVersions("2.0.15", "2.0.15"), 0);
    assert.strictEqual(compareVersions("2.1.0", "2.0.99"), 1);
    assert.strictEqual(compareVersions("v2.0.16", "2.0.16"), 0);
    assert.strictEqual(compareVersions("2.0.16-beta.1", "2.0.15"), 1);
    assert.strictEqual(compareVersions("2.0", "2.0.0"), 0);
  });

  test("isValidVersionString validates semver-like strings", () => {
    assert.strictEqual(isValidVersionString("2.0.16"), true);
    assert.strictEqual(isValidVersionString("2.0.16-beta.1"), true);
    assert.strictEqual(isValidVersionString(" 2.0.16 "), true);
    assert.strictEqual(isValidVersionString("invalid"), false);
    assert.strictEqual(isValidVersionString(""), false);
    assert.strictEqual(isValidVersionString(null), false);
    assert.strictEqual(isValidVersionString(123), false);
  });

  test("getEntriesBetween returns entries in (fromExclusive, toInclusive] sorted descending", () => {
    const unordered = [...SAMPLE_CHANGELOG].reverse();
    const between = getEntriesBetween(unordered, "2.0.14", "2.0.16");
    assert.deepStrictEqual(
      between.map((e) => e.version),
      ["2.0.16", "2.0.15"]
    );

    const allUpTo15 = getEntriesBetween(unordered, null, "2.0.15");
    assert.deepStrictEqual(
      allUpTo15.map((e) => e.version),
      ["2.0.15", "2.0.14", "2.0.9"]
    );

    const empty = getEntriesBetween(unordered, "2.0.16", "2.0.16");
    assert.deepStrictEqual(empty, []);
  });

  test("evaluateUpdateNotification shows welcome modal on fresh install", () => {
    const result = evaluateUpdateNotification({
      hadPersistedSettingsData: false,
      lastSeenVersion: null,
      currentVersion: "2.0.16",
      showWhatsNewOnUpdate: true,
      changelog: SAMPLE_CHANGELOG
    });

    assert.strictEqual(result.mode, "welcome");
    assert.strictEqual(result.shouldPersistVersion, true);
    assert.deepStrictEqual(
      result.entries.map((e) => e.version),
      ["2.0.16"]
    );
  });

  test("evaluateUpdateNotification shows latest entry for existing users without lastSeenVersion", () => {
    const result = evaluateUpdateNotification({
      hadPersistedSettingsData: true,
      lastSeenVersion: null,
      currentVersion: "2.0.16",
      showWhatsNewOnUpdate: true,
      changelog: SAMPLE_CHANGELOG
    });

    assert.strictEqual(result.mode, "update");
    assert.strictEqual(result.shouldPersistVersion, true);
    assert.deepStrictEqual(
      result.entries.map((e) => e.version),
      ["2.0.16"]
    );
  });

  test("evaluateUpdateNotification shows all intermediate entries when upgrading across versions", () => {
    const result = evaluateUpdateNotification({
      hadPersistedSettingsData: true,
      lastSeenVersion: "2.0.14",
      currentVersion: "2.0.16",
      showWhatsNewOnUpdate: true,
      changelog: SAMPLE_CHANGELOG
    });

    assert.strictEqual(result.mode, "update");
    assert.strictEqual(result.shouldPersistVersion, true);
    assert.deepStrictEqual(
      result.entries.map((e) => e.version),
      ["2.0.16", "2.0.15"]
    );
  });

  test("evaluateUpdateNotification respects showWhatsNewOnUpdate=false while still persisting version", () => {
    const result = evaluateUpdateNotification({
      hadPersistedSettingsData: true,
      lastSeenVersion: "2.0.14",
      currentVersion: "2.0.16",
      showWhatsNewOnUpdate: false,
      changelog: SAMPLE_CHANGELOG
    });

    assert.strictEqual(result.mode, "none");
    assert.deepStrictEqual(result.entries, []);
    assert.strictEqual(result.shouldPersistVersion, true);
  });

  test("evaluateUpdateNotification does nothing on same version or downgrade", () => {
    const same = evaluateUpdateNotification({
      hadPersistedSettingsData: true,
      lastSeenVersion: "2.0.16",
      currentVersion: "2.0.16",
      showWhatsNewOnUpdate: true,
      changelog: SAMPLE_CHANGELOG
    });
    assert.strictEqual(same.mode, "none");
    assert.strictEqual(same.shouldPersistVersion, false);

    const downgrade = evaluateUpdateNotification({
      hadPersistedSettingsData: true,
      lastSeenVersion: "2.0.16",
      currentVersion: "2.0.15",
      showWhatsNewOnUpdate: true,
      changelog: SAMPLE_CHANGELOG
    });
    assert.strictEqual(downgrade.mode, "none");
    assert.strictEqual(downgrade.shouldPersistVersion, false);
  });

  test("sanitizeSettings validates lastSeenVersion and showWhatsNewOnUpdate", () => {
    assert.strictEqual(DEFAULT_SETTINGS.lastSeenVersion, null);
    assert.strictEqual(DEFAULT_SETTINGS.showWhatsNewOnUpdate, true);

    const valid = sanitizeSettings({
      lastSeenVersion: "2.0.15",
      showWhatsNewOnUpdate: false
    });
    assert.strictEqual(valid.lastSeenVersion, "2.0.15");
    assert.strictEqual(valid.showWhatsNewOnUpdate, false);

    const invalid = sanitizeSettings({
      lastSeenVersion: "not-a-version",
      showWhatsNewOnUpdate: "yes"
    });
    assert.strictEqual(invalid.lastSeenVersion, null);
    assert.strictEqual(invalid.showWhatsNewOnUpdate, true);
  });

  test("CI release guard: CHANGELOG includes manifest.json version, has no duplicates, and is sorted descending", () => {
    const manifestPath = path.resolve(process.cwd(), "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { version: string };

    assert.ok(CHANGELOG.length > 0, "CHANGELOG must not be empty");
    assert.ok(
      CHANGELOG.some((entry) => entry.version === manifest.version),
      `CHANGELOG must contain an entry for manifest.json version ${manifest.version}`
    );

    const seen = new Set<string>();
    for (let i = 0; i < CHANGELOG.length; i += 1) {
      const entry = CHANGELOG[i];
      assert.ok(isValidVersionString(entry.version), `Invalid version format: ${entry.version}`);
      assert.ok(!seen.has(entry.version), `Duplicate changelog version: ${entry.version}`);
      seen.add(entry.version);
      assert.ok(
        entry.highlights.length > 0 || (entry.fixes && entry.fixes.length > 0),
        `Changelog entry ${entry.version} must have at least one highlight or fix`
      );
      if (i > 0) {
        assert.ok(
          compareVersions(CHANGELOG[i - 1].version, entry.version) > 0,
          `CHANGELOG must be sorted descending: ${CHANGELOG[i - 1].version} should be > ${entry.version}`
        );
      }
    }
  });
});

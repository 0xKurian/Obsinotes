export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: string[];
  fixes?: string[];
}

/**
 * Bundled release notes shown in the "What's new" modal after updates.
 * Keep entries sorted in descending version order (newest first).
 * CI tests verify that the current manifest.json version has an entry here.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2.0.16",
    date: "2026-11-22",
    highlights: [
      'Added a "What\'s new" popup after plugin updates so you can see new features and fixes right away.',
      'Added a welcome overview for first-time installations and a "Show what\'s new" command in the Command Palette.',
      'Added a setting under "Community and feedback" to toggle update release notes or view them anytime.'
    ]
  },
  {
    version: "2.0.15",
    date: "2026-11-22",
    highlights: [
      "Improved frontmatter reliability when saving notebooks."
    ],
    fixes: [
      "Preserved on-disk frontmatter properties during save using atomic vault processing so external edits are not overwritten."
    ]
  },
  {
    version: "2.0.14",
    date: "2026-11-20",
    highlights: [
      "Added a default #notepages tag to new notebooks for easier filtering in Graph View."
    ],
    fixes: [
      "Matched native Obsidian pill remove button styling in the Properties editor."
    ]
  },
  {
    version: "2.0.13",
    date: "2026-11-20",
    highlights: [
      "Added native-style autocomplete and context menu support to the Properties editor.",
      "Changed new notebooks to default to .gnote.md files so they appear seamlessly in Obsidian's Graph View."
    ]
  },
  {
    version: "2.0.12",
    date: "2026-11-20",
    highlights: [
      "Moved the Properties editor into a dedicated toolbar modal for a cleaner canvas."
    ]
  },
  {
    version: "2.0.11",
    date: "2026-11-20",
    highlights: [
      "Refined the Properties UI and interactions to closely match native Obsidian Properties."
    ]
  }
];

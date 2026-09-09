import { test } from "node:test";
import assert from "node:assert/strict";
import { indexMarkdown, indexText, type IndexEntry } from "./bake";

const entries: IndexEntry[] = [
  {
    title: "Level-2 Notes",
    url: "https://remilia.org/updates/level-2-notes",
    date: "2026-02-14T09:30:00.000Z",
    excerpt: "Where the network goes next.",
  },
  {
    title: "Admin Reveal",
    url: "https://remilia.org/updates/admin-reveal",
    date: "2025-12-25T00:00:00.000Z",
    excerpt: "",
  },
];

test("index markdown lists dated links and drops empty excerpts", () => {
  const md = indexMarkdown(
    "Remilia Corporation — Updates",
    "Company essays and memos.",
    "https://remilia.org/updates",
    entries,
  );
  assert.match(md, /^# Remilia Corporation — Updates\n/);
  assert.match(md, /^> Company essays and memos\.$/m);
  assert.match(
    md,
    /^- 2026-02-14 — \[Level-2 Notes\]\(https:\/\/remilia\.org\/updates\/level-2-notes\): Where the network goes next\.$/m,
  );
  assert.match(
    md,
    /^- 2025-12-25 — \[Admin Reveal\]\(https:\/\/remilia\.org\/updates\/admin-reveal\)$/m,
  );
});

test("index text carries title, url, and excerpt per post", () => {
  const txt = indexText(
    "Remilia Corporation — Updates",
    "Company essays and memos.",
    "https://remilia.org/updates",
    entries,
  );
  assert.ok(
    txt.includes(
      "2026-02-14 — Level-2 Notes\nhttps://remilia.org/updates/level-2-notes\nWhere the network goes next.",
    ),
  );
  assert.ok(
    txt.includes("2025-12-25 — Admin Reveal\nhttps://remilia.org/updates/admin-reveal\n"),
  );
  assert.ok(!txt.includes("undefined"));
});

test("empty section omits the post list entirely", () => {
  const md = indexMarkdown("Archive", "Outside coverage.", "https://remilia.org/archive", []);
  const txt = indexText("Archive", "Outside coverage.", "https://remilia.org/archive", []);
  assert.ok(!md.includes("## Posts"));
  assert.ok(md.endsWith("https://remilia.org/archive\n"));
  assert.ok(txt.endsWith("https://remilia.org/archive\n"));
});

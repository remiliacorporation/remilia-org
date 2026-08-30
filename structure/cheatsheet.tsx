import type { ReactNode } from "react";

const TEXT = [
  "When to use which section",
  "",
  "ORG (remilia.org)",
  "• Updates — routine company notes, shipping logs, small announcements.",
  "• Press — formal releases, major launches, statements meant to be cited as press.",
  "• Thought — essays, longform, positions; not a release, not a changelog.",
  "• Archive — notable posts/interviews/articles (ours or coverage of us). External entries need outlet + original URL; /archive/<slug> is our citing record.",
  "",
  "COM (remilia.com)",
  "• News — brand/journal posts (replaces /a/studio) → /a/news",
  "• Events — event posts → /a/events (same post type as news; pick section Events)",
  "• Shows — dated listings with venue/albums (event docs) under /a/events/shows",
  "",
  "NET (remilia.net)",
  "• Updates — product/network routine notes (schema id net-updates; path /updates).",
  "• Devblog — engineering depth, changelogs, technical writeups.",
  "",
  "One Sanity project / dataset. Pick the section; host + URL are derived.",
].join("\n");

export function SectionCheatsheet(): ReactNode {
  return (
    <pre
      style={{
        margin: 0,
        padding: "1.25rem 1.5rem",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13,
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        maxWidth: 52 * 16,
      }}
    >
      {TEXT}
    </pre>
  );
}

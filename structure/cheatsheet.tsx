import type { ReactNode } from "react";

const TEXT = [
  "When to use which section",
  "",
  "Host missions",
  "• remilia.org — theory and NFTs",
  "• remilia.com — fashion, lifestyle brand, publishing (+ events)",
  "• remilia.net — software outside NFTs (RemiliaNET, wiki, miladychan)",
  "",
  "ORG (remilia.org)",
  "• Updates — small company notes / memos that are not theory and not press.",
  "• Press — formal releases AND external coverage (Decrypt, Forbes, interviews, etc.).",
  "• Thought — theory, positions, NFT essays / design notes.",
  "• Archive — rare first-party archival cites; do not put Decrypt-style coverage here (use Press).",
  "",
  "COM (remilia.com)",
  "• News — fashion, lifestyle brand, publishing → /a/news",
  "• Events — event writeups + gallery albums → /a/events",
  "",
  "NET (remilia.net)",
  "• Dev updates — RemiliaNET / wiki / miladychan product notes (id `dev-updates`; path /updates).",
  "• Dev blog — engineering depth (id `dev-blog`; path /blog).",
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

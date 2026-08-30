import type { ReactNode } from "react";

const TEXT = [
  "When to use which section",
  "",
  "Host missions",
  "• remilia.org — theory + NFTs (thought), press releases, company updates, archive",
  "• remilia.com — fashion / lifestyle brand / publishing (news) + events",
  "• remilia.net — software outside NFTs (RemiliaNET, wiki, miladychan)",
  "",
  "ORG (remilia.org)",
  "• Updates — company essays/memos (Christmas missive, Level-2, Admin Reveal, …).",
  "• Press — first-party press releases only.",
  "• Thought — org/product-relevant thought leadership (theory + NFTs).",
  "• Archive — (1) external coverage & interviews (Firecrawl snapshot of the linked page);",
  "          (2) secondary Substack/Paragraph that aren’t core org/product TL.",
  "",
  "COM (remilia.com)",
  "• News — fashion, lifestyle brand, publishing → /a/news",
  "• Events — event writeups + gallery albums → /a/events",
  "",
  "NET (remilia.net)",
  "• Dev updates — RemiliaNET / wiki / miladychan (id `dev-updates`; path /updates).",
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

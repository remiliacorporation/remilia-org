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
  "• Press — org corporate statements only (not brand product releases).",
  "• Thought — org/product-relevant thought leadership (theory + NFTs).",
  "• Archive — (1) external coverage & interviews (Firecrawl snapshot of the linked page);",
  "          (2) secondary Substack/Paragraph that aren’t core org/product TL.",
  "",
  "COM (remilia.com)",
  "• News — fashion, lifestyle brand, publishing, and brand press releases",
  "         (HIKKI Punks, Atelier, FRUiTS, product launches) → /a/news",
  "• Events — event writeups + gallery albums → /a/events",
  "",
  "NET (remilia.net)",
  "• Dev updates — other RemiliaNET product notes (vault, etc.; id `dev-updates`).",
  "• Dev blog — RemiliaNET Alpha, wiki, miladychan engineering posts (id `dev-blog`; path /blog).",
  "",
  "One Sanity project / dataset. Pick the section; host + URL are derived.",
  "",
  "If a section pane looks empty on remilia.sanity.studio, the hosted Studio is",
  "stale — Admin must run `pnpm run deploy:studio`. Brand PRs are under Com → News,",
  "not Org → Press. Use Vision or local `pnpm dev` until redeployed.",
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

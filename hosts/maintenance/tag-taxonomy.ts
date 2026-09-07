export const TAG_TAXONOMY: Array<{
  name: string;
  slug: string;
  description: string;
}> = [
  {
    name: "Milady",
    slug: "milady",
    description: "Milady Maker and related culture.",
  },
  {
    name: "Remilia",
    slug: "remilia",
    description: "Remilia Corporation as subject.",
  },
  {
    name: "Network Spirituality",
    slug: "network-spirituality",
    description: "Network spirituality essays and notes.",
  },
  {
    name: "Net Art",
    slug: "net-art",
    description: "New net art and related practice.",
  },
  {
    name: "NFT",
    slug: "nft",
    description: "NFTs, collections, and on-chain culture.",
  },
  {
    name: "Authorship",
    slug: "authorship",
    description: "Pseudonymity, post-authorship, identity.",
  },
  {
    name: "Crypto",
    slug: "crypto",
    description: "Crypto markets, culture, and critique.",
  },
  {
    name: "Fashion",
    slug: "fashion",
    description: "Fashion, street style, and brand.",
  },
  {
    name: "Culture",
    slug: "culture",
    description: "Broader cultural commentary.",
  },
  {
    name: "RemiliaNET",
    slug: "remilianet",
    description: "RemiliaNET, vault, miladychan, wiki.",
  },
  {
    name: "Coverage",
    slug: "coverage",
    description: "External press and interviews about Remilia.",
  },
  {
    name: "Essay",
    slug: "essay",
    description: "Long-form essays and thought pieces.",
  },
  {
    name: "Announcement",
    slug: "announcement",
    description: "Company or product announcements.",
  },
  {
    name: "Event",
    slug: "event",
    description: "Raves, parties, and gatherings.",
  },
  { name: "Interview", slug: "interview", description: "Interviews." },
  { name: "Guide", slug: "guide", description: "How-tos and onboarding." },
  {
    name: "Press Release",
    slug: "press-release",
    description: "Official press releases.",
  },
  {
    name: "Feature",
    slug: "feature",
    description: "Feature stories and spotlights.",
  },
];

const LEGACY_MAP: Record<string, string | null> = {
  Announcements: "Announcement",
  Events: "Event",
  Thought: "Essay",
  Note: "Essay",
  Review: "Essay",
  Project: "Remilia",
  Archive: "Coverage",
  Press: null,
  Feature: "Feature",
  "Press Release": "Press Release",
  Interview: "Interview",
  Guide: "Guide",
  NFT: "NFT",
  Urbit: "RemiliaNET",
};

function has(hay: string, ...needles: string[]): boolean {
  const h = hay.toLowerCase();
  return needles.some((n) => h.includes(n.toLowerCase()));
}

export function suggestTags(input: {
  title: string;
  channel: string;
  origin?: string | null;
  outlet?: string | null;
  excerpt?: string | null;
  existing?: string[] | null;
  source?: string | null;
}): string[] {
  const title = input.title ?? "";
  const blob = `${title} ${input.excerpt ?? ""}`;
  const out = new Set<string>();

  for (const t of input.existing ?? []) {
    if (LEGACY_MAP[t] === null) continue;
    const mapped = LEGACY_MAP[t] ?? t;
    if (TAG_TAXONOMY.some((x) => x.name === mapped)) out.add(mapped);
  }

  switch (input.channel) {
    case "updates":
      out.add("Announcement");
      break;
    case "press":
      out.add("Press Release");
      break;
    case "thought":
      out.add("Essay");
      break;
    case "archive":
      if (input.origin === "external") out.add("Coverage");
      else out.add("Essay");
      break;
    case "news":
      out.add(
        has(title, "Press Release", "launches", "Announces")
          ? "Press Release"
          : "Feature",
      );
      break;
    case "events":
      out.add("Event");
      break;
    case "dev-blog":
    case "dev-updates":
      out.add("RemiliaNET");
      break;
    default:
      break;
  }

  if (has(blob, "milady", "remilio", "fumo")) out.add("Milady");
  if (has(blob, "remilia")) out.add("Remilia");
  if (has(blob, "network spiritual", "network spirituality", "godpost"))
    out.add("Network Spirituality");
  if (has(blob, "net art", "post-author", "post authorship", "new wave of net"))
    out.add("Net Art");
  if (has(blob, "nft", "milady maker", " Remilio")) out.add("NFT");
  if (
    has(
      blob,
      "pseudonym",
      "doxx",
      "dox ",
      "authorship",
      "vessel",
      "miya",
      "deanonym",
    )
  )
    out.add("Authorship");
  if (has(blob, "crypto", "web3", "bitcoin", "ethereum", "token"))
    out.add("Crypto");
  if (
    has(blob, "fashion", "cheongsam", "gyaru", "33reisen", "fruits", "fruits")
  )
    out.add("Fashion");
  if (has(blob, "culture", "girl culture", "overton", "cancel"))
    out.add("Culture");
  if (has(blob, "remilianet", "miladychan", "vault", "remiliachat", "wiki"))
    out.add("RemiliaNET");
  if (has(title, "Interview") || input.outlet) {
    if (input.origin === "external") out.add("Coverage");
  }
  if (has(title, "Interview")) out.add("Interview");
  if (has(title, "Guide", "Onboarding", "travel guide")) out.add("Guide");

  const preferred = [
    "Announcement",
    "Press Release",
    "Event",
    "Coverage",
    "Interview",
    "Feature",
    "Guide",
    "Essay",
    "Milady",
    "Network Spirituality",
    "Net Art",
    "Authorship",
    "RemiliaNET",
    "NFT",
    "Crypto",
    "Fashion",
    "Culture",
    "Remilia",
  ];
  const ordered = preferred.filter((t) => out.has(t));
  return ordered.slice(0, 4);
}

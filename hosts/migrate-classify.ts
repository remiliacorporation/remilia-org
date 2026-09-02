import type { Channel } from "@remilia/seo";
export type PostRow = {
    _id: string;
    title: string;
    slug: string;
    channel: string;
    tags: (string | null)[] | null;
    source: string | null;
    hrefs: (string | null)[] | null;
};
export type Plan = {
    id: string;
    title: string;
    from: string;
    to: Channel;
    reason: string;
    origin?: "first-party" | "external";
    externalUrl?: string;
    outlet?: string;
};
const SOCIAL = new Set(["twitter.com", "x.com", "www.twitter.com", "instagram.com", "www.instagram.com", "t.co"]);
const LOW_SCORE_HOST = /businesswire|globenewswire|issuewire|politico|youtube|reddit|wikipedia/;
const OUTLET_RES = [
    /^(?:Feature|News|Interview):\s*(.+?)\s+[-–—]\s+/i,
    /^Cultural Coverage:\s*(.+?)\s+(?:Explores|Features)/i,
    /^Event Coverage:\s*(.+?)\s+Reports/i,
    /^Thought Leadership:\s*(.+?)\s+Features/i,
];
const UPDATES_SLUGS = new Set([
    "corporate-memo-remilia-2024-christmas-missive",
    "can-whats-playing-milady-make-it-to-level-2",
    "admin-reveal-i-said-i-m-just-a-vessel-bro",
    "authorship-hashes",
    "external-memo-7-12-22-where-are-the-art-critics",
]);
const THOUGHT_PARAGRAPH = new Set([
    "remilia-corporation-onboarding-package",
    "the-new-lower-bound-of-network-spirituality-remilia-s-new-internet-as-reference-implementation-for-a-bottom-up-patchwork-gp",
    "network-spirituality-collected-commentaries",
    "notes-towards-a-study-of-remilia-s-art",
    "notes-on-the-new-wave-of-net-art",
    "notes-on-the-new-net-art-and-network-spirituality-guest-post-eschatalogies",
    "nft-s-and-free-information",
    "unpacking-post-authorship",
    "digital-post-identity-in-the-open-marketplace-of-ideas",
    "crypto-and-its-discontents-hello-web3-entryists",
    "reality-after-the-wired",
    "milady-as-a-total-art-gp",
    "four-notes-on-reading-remilia-collective-gp",
    "things-desired-an-egoless-online-gp",
    "what-remilia-believes-in-a-new-net-art-manifesto",
]);
const THOUGHT_GHOST = new Set([
    "what-remilia-believes-in-a-new-net-art-manifesto",
    "secondary-royalties",
    "the-nft-clearpill",
    "pfpnfts-we-havent-seen-profile-first-design-yet",
    "does-nft-bolster-authorship-or-supersede-it",
    "nfts-role-in-crypto-hyperfinancialization-abstract-art",
    "on-secondary",
    "nouns-wtf",
    "milady-maker",
    "bonkler-critical-notes",
    "redacted-remilio-babies-notes-on-the-design-process",
    "jadeposting",
    "a-peoples-history-of-hot-pot",
    "viral-public-license",
    "fumo-404",
]);
const tags = (p: PostRow) => new Set((p.tags ?? []).filter((t): t is string => !!t));
function host(url: string): string {
    try {
        return new URL(url).hostname.toLowerCase();
    }
    catch {
        return "";
    }
}
function remilia(url: string): boolean {
    const h = host(url);
    return (h === "remilia.org" ||
        h.endsWith(".remilia.org") ||
        h === "remilia.com" ||
        h.endsWith(".remilia.com") ||
        h === "remilia.net" ||
        h.endsWith(".remilia.net") ||
        h === "www.remilia.net");
}
export function pickExternalUrl(hrefs: (string | null)[] | null, outlet?: string): string | undefined {
    const urls = (hrefs ?? []).filter((h): h is string => !!h && h.startsWith("http") && !remilia(h));
    if (!urls.length)
        return undefined;
    const hint = outlet?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
    const scored = urls.map((u) => {
        const h = host(u);
        const hk = h.replace(/[^a-z0-9]/g, "");
        let score = 0;
        try {
            const depth = new URL(u).pathname.replace(/\/$/, "").split("/").filter(Boolean).length;
            score += depth >= 2 ? 3 : depth ? 1 : 0;
        }
        catch { }
        if (hint.length >= 4) {
            const stem = hint.slice(0, Math.min(10, hint.length));
            if (hk.includes(stem.slice(0, 6)) || stem.includes(hk.slice(0, 6)))
                score += 8;
        }
        if (SOCIAL.has(h))
            score -= 5;
        if (LOW_SCORE_HOST.test(h))
            score -= 2;
        return { u, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.u;
}
export function parseOutlet(title: string): string | undefined {
    for (const re of OUTLET_RES) {
        const m = title.match(re);
        if (m?.[1])
            return m[1].trim();
    }
    return undefined;
}
const pressRelease = (title: string, t: Set<string>) => t.has("Press Release") || /^Press Release:/i.test(title);
const orgCorporate = (title: string) => /\bcondemns?\b|\bstatement\b|\bunrepresentative\b/i.test(title);
const externalCoverage = (title: string, t: Set<string>) => t.has("Interview") ||
    /^(Feature|News|Interview|Cultural Coverage|Event Coverage|Thought Leadership):/i.test(title) ||
    (t.has("Press") && t.has("Feature") && !t.has("Press Release"));
const devBlog = (title: string, slug: string) => /^RemiliaNET\b/i.test(title) ||
    /RemiliaNET Alpha/i.test(title) ||
    /api|developer portal/i.test(title) ||
    /miladychan/i.test(title) ||
    /miladychan/i.test(slug) ||
    /remilia wiki/i.test(title) ||
    slug === "remilia-wiki-launch";
const devUpdates = (title: string, slug: string) => /^RemiliaNET\b/i.test(title) ||
    /RemiliaNET Alpha/i.test(title) ||
    /vault architecture/i.test(title) ||
    /miladychan/i.test(title) ||
    /miladychan/i.test(slug) ||
    /remilia wiki/i.test(title) ||
    slug === "remilia-wiki-launch" ||
    (/remilianet/i.test(title) && /miladycraft/i.test(title));
const comNews = (title: string, slug: string) => /exegesis/i.test(title) ||
    /exegesis/i.test(slug) ||
    (/pre-release announcement/i.test(title) && /miya|exegesis|book|manuscript/i.test(title));
type Hit = Pick<Plan, "to" | "reason" | "origin" | "externalUrl" | "outlet">;
function archiveExternal(p: PostRow, reason: string): Hit {
    const outlet = parseOutlet(p.title);
    return {
        to: "archive",
        reason,
        origin: "external",
        externalUrl: pickExternalUrl(p.hrefs, outlet),
        outlet,
    };
}
const rules: ((p: PostRow, t: Set<string>) => Hit | null)[] = [
    (p, t) => (t.has("Events") ? { to: "events", reason: "tag:Events" } : null),
    (p, t) => (devBlog(p.title, p.slug) ? { to: "dev-blog", reason: "RemiliaNET Alpha / wiki / miladychan → dev-blog" } : null),
    (p, t) => (devUpdates(p.title, p.slug) ? { to: "dev-updates", reason: "net software product note" } : null),
    (p, t) => pressRelease(p.title, t) && !orgCorporate(p.title)
        ? { to: "news", reason: "brand / fashion / lifestyle / publishing" }
        : null,
    (p, t) => (comNews(p.title, p.slug) ? { to: "news", reason: "brand / fashion / lifestyle / publishing" } : null),
    (p, t) => (pressRelease(p.title, t) ? { to: "press", reason: "org corporate press statement" } : null),
    (p, t) => externalCoverage(p.title, t) || (t.has("Press") && !t.has("Press Release"))
        ? archiveExternal(p, "press coverage / interview → archive")
        : null,
    (p, t) => UPDATES_SLUGS.has(p.slug) || (/corporate memo/i.test(p.title) && /christmas|missive/i.test(p.title))
        ? { to: "updates", reason: "company essay / memo" }
        : null,
    (p, t) => THOUGHT_PARAGRAPH.has(p.slug) || THOUGHT_GHOST.has(p.slug)
        ? { to: "thought", reason: "org/product thought leadership" }
        : null,
    (p, t) => t.has("Thought") || t.has("Note") || t.has("Review") || t.has("NFT")
        ? { to: "thought", reason: "theory/NFT tag" }
        : null,
    (p, t) => t.has("Project") && !devUpdates(p.title, p.slug) ? { to: "thought", reason: "project design essay" } : null,
    (p, t) => p.source === "substack" || p.source === "paragraph"
        ? { to: "archive", reason: `secondary ${p.source} → archive`, origin: "first-party" }
        : null,
    (p, t) => (t.has("Guide") ? { to: "archive", reason: "secondary guide → archive", origin: "first-party" } : null),
    (p, t) => (t.has("Announcements") ? { to: "updates", reason: "tag:Announcements" } : null),
    (p, t) => (p.source === "ghost" ? { to: "thought", reason: "untagged ghost → thought" } : null),
];
export function classify(p: PostRow): Plan {
    const t = tags(p);
    const base = { id: p._id, title: p.title ?? "", from: p.channel };
    for (const rule of rules) {
        const hit = rule(p, t);
        if (hit)
            return { ...base, ...hit };
    }
    return { ...base, to: "thought", reason: "fallback → thought" };
}


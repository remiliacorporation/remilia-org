/**
 * Merge bake-generated Ghost→press redirects into Netlify `_redirects`.
 * Hand-authored rules stay; the marker block is replaced each bake.
 * The catch-all `/* … 404` rule always stays last.
 */

export const LEGACY_REDIRECTS_BEGIN = "# BEGIN bake:legacy-redirects";
export const LEGACY_REDIRECTS_END = "# END bake:legacy-redirects";

export interface RedirectRule {
  from: string;
  to: string;
}

/** Netlify `_redirects` line; force (`!`) so it wins over existing files. */
export function netlifyRedirectLine(rule: RedirectRule): string {
  return `${rule.from}  ${rule.to}  301!`;
}

export function stripLegacyRedirectBlock(existing: string): string {
  const re = new RegExp(
    `${escapeRegExp(LEGACY_REDIRECTS_BEGIN)}[\\s\\S]*?${escapeRegExp(LEGACY_REDIRECTS_END)}\\n?`,
    "m",
  );
  return existing.replace(re, "");
}

export function formatLegacyRedirectBlock(rules: RedirectRule[]): string {
  if (rules.length === 0) return "";
  const body = rules.map(netlifyRedirectLine).join("\n");
  return `${LEGACY_REDIRECTS_BEGIN}\n${body}\n${LEGACY_REDIRECTS_END}\n`;
}

/**
 * Insert or replace the bake legacy-redirect block before the catch-all 404.
 * Dedupes by `from`, keeps first occurrence order.
 */
export function mergeLegacyRedirects(existing: string, rules: RedirectRule[]): string {
  const seen = new Set<string>();
  const unique: RedirectRule[] = [];
  for (const r of rules) {
    if (seen.has(r.from)) continue;
    seen.add(r.from);
    unique.push(r);
  }

  const without = stripLegacyRedirectBlock(existing).replace(/\s+$/, "\n");
  const block = formatLegacyRedirectBlock(unique);
  if (!block) return without.endsWith("\n") ? without : `${without}\n`;

  const catchAll = /^(\/\*[\t ]+\/404\.html[\t ]+404)\s*$/m;
  const m = catchAll.exec(without);
  if (m && m.index !== undefined) {
    const before = without.slice(0, m.index).replace(/\s+$/, "\n");
    const after = without.slice(m.index);
    return `${before}\n${block}${after.startsWith("\n") ? after.slice(1) : after}`;
  }
  return `${without}${without.endsWith("\n") ? "" : "\n"}\n${block}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

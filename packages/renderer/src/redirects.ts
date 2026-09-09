/**
 * Merge bake-generated rules into Netlify `_redirects`. Hand-authored rules
 * stay; each named block is replaced whole on every bake, and the catch-all
 * `/* … 404` rule always stays last so narrower rules win.
 */

export interface RedirectRule {
  from: string;
  to: string;
  /** Netlify status; 301 unless given. */
  status?: number;
  /** Append `!` so the rule wins over an existing file at `from`. */
  force?: boolean;
}

export const blockBegin = (name: string): string => `# BEGIN bake:${name}`;
export const blockEnd = (name: string): string => `# END bake:${name}`;

/**
 * 301s for every path a post used to live at. A bare alias is a former slug
 * in the same section; one starting with `/` is a full former path, which is
 * how a move between sections keeps its old links alive.
 *
 * Each path also redirects its `.md` and `.txt` siblings, so a citation of a
 * machine-readable rendition survives a rename exactly as the page does.
 */
export function aliasRules(
  basePath: string,
  posts: { slug: string; aliases?: string[] }[],
): RedirectRule[] {
  const rules: RedirectRule[] = [];
  for (const post of posts) {
    const to = `${basePath}/${post.slug}`;
    for (const alias of post.aliases ?? []) {
      const trimmed = alias.trim();
      if (!trimmed) continue;
      const from = trimmed.startsWith("/")
        ? trimmed.replace(/\/+$/, "")
        : `${basePath}/${trimmed}`;
      if (from === to) continue;
      rules.push(
        { from, to },
        { from: `${from}.md`, to: `${to}.md` },
        { from: `${from}.txt`, to: `${to}.txt` },
      );
    }
  }
  return rules;
}

export function netlifyRedirectLine(rule: RedirectRule): string {
  const status = rule.status ?? 301;
  return `${rule.from}  ${rule.to}  ${status}${rule.force ? "!" : ""}`;
}

/**
 * Removes a named block. Markers must be whole lines, so a hand-authored
 * comment that mentions a marker cannot swallow the rules that follow it.
 */
export function stripRedirectBlock(existing: string, name: string): string {
  const re = new RegExp(
    `^${escapeRegExp(blockBegin(name))}$[\\s\\S]*?^${escapeRegExp(blockEnd(name))}$\\n?`,
    "m",
  );
  return existing.replace(re, "");
}

export function formatRedirectBlock(
  name: string,
  rules: RedirectRule[],
): string {
  if (rules.length === 0) return "";
  const body = rules.map(netlifyRedirectLine).join("\n");
  return `${blockBegin(name)}\n${body}\n${blockEnd(name)}\n`;
}

/**
 * Inserts or replaces one named block before the catch-all 404. Dedupes by
 * `from`, keeping first occurrence order. Idempotent: baking twice with the
 * same rules yields the same file.
 */
export function mergeRedirectBlock(
  existing: string,
  name: string,
  rules: RedirectRule[],
): string {
  const seen = new Set<string>();
  const unique: RedirectRule[] = [];
  for (const rule of rules) {
    if (seen.has(rule.from)) continue;
    seen.add(rule.from);
    unique.push(rule);
  }

  const without = stripRedirectBlock(existing, name).replace(/\s+$/, "\n");
  const block = formatRedirectBlock(name, unique);
  // Removing a block leaves the blank lines that surrounded it, so collapse
  // runs before returning: every bake re-merges each block, and the file has
  // to converge instead of growing a blank line per run.
  const tidy = (text: string): string => text.replace(/\n{3,}/g, "\n\n");
  if (!block) return tidy(without.endsWith("\n") ? without : `${without}\n`);

  const catchAll = /^(\/\*[\t ]+\/404\.html[\t ]+404)\s*$/m;
  const match = catchAll.exec(without);
  if (match) {
    const before = without.slice(0, match.index).replace(/\s+$/, "\n");
    const after = without.slice(match.index);
    return tidy(
      `${before}\n${block}${after.startsWith("\n") ? after.slice(1) : after}`,
    );
  }
  return tidy(`${without}${without.endsWith("\n") ? "" : "\n"}\n${block}`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

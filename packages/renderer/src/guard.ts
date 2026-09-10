import { createClient } from "@sanity/client";

/**
 * A tokenless read of a private dataset answers `0` documents with no error,
 * and an expired token answers 401. Either way the bake would overwrite live
 * output with an empty dataset, so the host proves credentials and requires
 * at least one post before writing any section.
 */
export const EMPTY_BAKE_ESCAPE = "ALLOW_EMPTY_BAKE=1";

export class BakeRefused extends Error {}

export type ContentPerspective = "published" | "drafts";

/** Reason a Sanity read cannot be trusted, or `undefined` when it can. */
export function refusalFor(input: {
  token?: string;
  postCount: number;
  what: string;
}): string | undefined {
  if (!input.token)
    return (
      `no Sanity token, so reads return an empty dataset rather than failing. ` +
      `Set SANITY_TOKEN or SANITY_AUTH_TOKEN`
    );
  if (input.postCount === 0)
    return (
      `the query returned no posts for ${input.what}. Publishing from an empty ` +
      `dataset would replace live output`
    );
  return undefined;
}

/** Maps a thrown Sanity error to a message that names the likely cause. */
export function readFailureMessage(err: unknown): string {
  const status =
    typeof err === "object" && err !== null && "statusCode" in err
      ? err.statusCode
      : undefined;
  const detail = err instanceof Error ? err.message : String(err);
  if (status === 401 || status === 403)
    return `Sanity rejected the token (${String(status)}): ${detail}. The token is missing, expired or lacks read access`;
  return `Sanity read failed: ${detail}`;
}

/**
 * Throws unless the dataset can be read and holds posts. Runs before any file
 * is written so a bad credential cannot leave a half-rewritten host behind.
 */
export async function assertDatasetReadable(opts: {
  projectId: string;
  dataset: string;
  token?: string;
  allowEmpty?: boolean;
  perspective?: ContentPerspective;
}): Promise<number> {
  if (opts.allowEmpty) return 0;
  const refusal = refusalFor({
    token: opts.token,
    postCount: 1,
    what: opts.dataset,
  });
  if (refusal) throw new BakeRefused(`${refusal}, or set ${EMPTY_BAKE_ESCAPE}`);

  const perspective = opts.perspective ?? "published";
  const client = createClient({
    projectId: opts.projectId,
    dataset: opts.dataset,
    apiVersion: "2026-02-01",
    useCdn: false,
    token: opts.token,
    perspective,
  });
  let total: number;
  try {
    total = await client.fetch<number>('count(*[_type == "post"])');
  } catch (err) {
    throw new BakeRefused(`${readFailureMessage(err)} — refusing to bake`);
  }
  const empty = refusalFor({
    token: opts.token,
    postCount: total,
    what: `dataset ${opts.dataset}`,
  });
  if (empty) throw new BakeRefused(`${empty}, or set ${EMPTY_BAKE_ESCAPE}`);
  return total;
}

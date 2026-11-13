import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  useClient,
  useFormValue,
  type FieldProps,
  type ObjectInputProps,
  type StringFieldProps,
  type StringInputProps,
} from "sanity";
import { usePresentationParams } from "sanity/presentation";
import { CHANNELS, type Channel } from "../lib/access";
import {
  FRAME_POSTS_QUERY,
  frameBody,
  type FramePost,
  type FrameRow,
} from "./frameParts";
import { hasOldFootnotes } from "../packages/renderer/src/footnotes";
import { frameChannel } from "./pageFrame";
import { PostPage, TitleRoot } from "./postPage";

const WRITE = new Set(["title", "body", "commentary"]);

const SettingsRoot = createContext<HTMLElement | null>(null);

function bylineDate(iso: unknown): string {
  if (typeof iso !== "string" || !iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${mm}.${dd}.${yy}`;
}

function channelLabel(channel: unknown): string {
  if (typeof channel !== "string") return "";
  const hit = CHANNELS.find((c) => c.value === channel);
  return hit ? hit.title.split(" (")[0] : "";
}

function authorIds(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  return authors
    .map((a) =>
      a && typeof a === "object" && "_ref" in a ? String(a._ref) : "",
    )
    .filter(Boolean);
}

/** The post's author names, in the post's own order, as the bake reads them. */
function useAuthorNames(authors: unknown): string[] {
  const client = useClient({ apiVersion: "2026-02-01" });
  const key = authorIds(authors).join(",");
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (!ids.length) {
      setNames([]);
      return;
    }
    let cancelled = false;
    client
      .fetch<{ _id: string; name?: string }[]>(
        `*[_id in $ids]{ _id, name }`,
        { ids },
      )
      .then((rows) => {
        if (cancelled) return;
        const byId = new Map(rows.map((r) => [r._id, r.name?.trim()]));
        setNames(ids.flatMap((id) => byId.get(id) || []));
      })
      .catch(() => {
        if (!cancelled) setNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client, key]);

  return names;
}

/**
 * The section's published posts, for the page's rail and adjacent links:
 * what the public site lists, read with the editor's own session.
 */
function useSectionPosts(channel: Channel): FrameRow[] {
  const client = useClient({ apiVersion: "2026-02-01" });
  const [rows, setRows] = useState<FrameRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    client
      .withConfig({ perspective: "published" })
      .fetch<FrameRow[]>(FRAME_POSTS_QUERY, { channel, includeFuture: false })
      .then((found) => {
        if (!cancelled) setRows(found ?? []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client, channel]);

  return rows;
}

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

function ArticleByline(props: {
  publishedAt: unknown;
  channel: unknown;
  names: string;
}): ReactNode {
  const { publishedAt, channel, names } = props;
  return (
    <div className="blog-article-byline">
      <span className="blog-article-byline-date">{bylineDate(publishedAt)}</span>
      <span className="blog-article-byline-cat">{channelLabel(channel)}</span>
      <span className="blog-article-byline-author">{names}</span>
    </div>
  );
}

export function TitleField(props: StringFieldProps): ReactNode {
  const root = useContext(TitleRoot);
  const error = props.validation.find((v) => v.level === "error");
  const node = (
    <div className="blog-title-field">
      <label className="blog-sr" htmlFor={props.inputId}>
        {props.title}
      </label>
      {props.children}
      {error ? <p className="blog-field-error">{error.message}</p> : null}
    </div>
  );
  if (!root) return node;
  return createPortal(node, root);
}

export function TitleInput(props: StringInputProps): ReactNode {
  const inner = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(resize, [props.value]);
  return (
    <textarea
      {...props.elementProps}
      ref={inner}
      className="blog-title-input"
      rows={1}
      value={props.value ?? ""}
      placeholder="Title"
      onInput={resize}
    />
  );
}

/** Top-level post fields that belong in the settings drawer, not the article. */
export function SettingsField(props: FieldProps): ReactNode {
  const root = useContext(SettingsRoot);
  const node = props.renderDefault(props);
  if (!root) return node;
  const name = String(props.path[0] ?? props.name);
  if (props.path.length !== 1 || WRITE.has(name)) return node;
  return createPortal(node, root);
}

function pinEditorToolbar(shell: HTMLElement): () => void {
  const clear = (tb: HTMLElement) => {
    tb.style.removeProperty("position");
    tb.style.removeProperty("top");
    tb.style.removeProperty("left");
    tb.style.removeProperty("width");
    tb.style.removeProperty("height");
    tb.style.removeProperty("z-index");
    tb.style.removeProperty("margin");
  };
  let tb: HTMLElement | null = null;
  const pin = () => {
    const bar = shell.querySelector(".blog-desk-bar") as HTMLElement | null;
    const next = shell.querySelector(
      "[data-testid='pt-editor'] [data-testid='pt-editor__toolbar-card']",
    ) as HTMLElement | null;
    if (tb && tb !== next) clear(tb);
    tb = next;
    if (!bar || !tb) return;
    const r = bar.getBoundingClientRect();
    tb.style.setProperty("position", "fixed", "important");
    tb.style.setProperty("top", `${Math.round(r.top)}px`, "important");
    tb.style.setProperty("left", `${Math.round(r.left)}px`, "important");
    tb.style.setProperty("width", `${Math.round(r.width)}px`, "important");
    tb.style.setProperty("height", `${Math.round(r.height)}px`, "important");
    tb.style.setProperty("z-index", "1", "important");
    tb.style.setProperty("margin", "0", "important");
  };
  pin();
  const sc = document.querySelector("[data-testid='document-panel-scroller']");
  sc?.addEventListener("scroll", pin, { passive: true });
  window.addEventListener("resize", pin);
  const obs = new MutationObserver(pin);
  obs.observe(shell, { childList: true, subtree: true });
  return () => {
    obs.disconnect();
    sc?.removeEventListener("scroll", pin);
    window.removeEventListener("resize", pin);
    if (tb) clear(tb);
  };
}

export function PostInput(props: ObjectInputProps): ReactNode {
  // Presentation shows the real page beside the pane, so the pane keeps the
  // compact article; everywhere else the post edits inside its page.
  const page = usePresentationParams(false) === null;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawer, setDrawer] = useState<HTMLElement | null>(null);
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const body = useFormValue(["body"]);
  const commentary = useFormValue(["commentary"]);
  // The schema locks a text that still holds old-format notes
  // (schemaTypes/objects/blockContent.ts); say why.
  const locked = hasOldFootnotes(body) || hasOldFootnotes(commentary);
  const bodyLen = Array.isArray(body)
    ? body.length
    : Array.isArray(commentary)
      ? commentary.length
      : 0;

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  useEffect(() => {
    if (!shell.current) return;
    return pinEditorToolbar(shell.current);
  }, []);

  const channelValue = useFormValue(["channel"]);
  const channel = frameChannel(channelValue);
  const publishedAt = useFormValue(["publishedAt"]);
  const names = useAuthorNames(useFormValue(["authors"]));
  const rows = useSectionPosts(channel);
  const id = text(useFormValue(["_id"]));
  const title = text(useFormValue(["title"]));
  const slug = text(useFormValue(["slug", "current"]));
  const excerpt = text(useFormValue(["excerpt"]));
  const origin = text(useFormValue(["origin"]));
  const outlet = text(useFormValue(["outlet"]));
  const externalUrl = text(useFormValue(["externalUrl"]));
  const noIndex = useFormValue(["seo", "noIndex"]) === true;
  const post = useMemo((): FramePost => {
    // The page shows the commentary on outside coverage, as the bake does.
    const coverage = channel === "archive" && origin === "external";
    const written = frameBody(commentary);
    return {
      id: id.replace(/^(?:drafts|versions\.[^.]+)\./, ""),
      title,
      slug,
      publishedAt: text(publishedAt),
      excerpt,
      authors: names,
      origin: origin || undefined,
      outlet: outlet || undefined,
      externalUrl: externalUrl || undefined,
      noIndex,
      body: coverage && written.length ? written : frameBody(body),
    };
  }, [
    channel,
    id,
    title,
    slug,
    publishedAt,
    excerpt,
    names,
    origin,
    outlet,
    externalUrl,
    noIndex,
    body,
    commentary,
  ]);

  const article = page ? (
    <PostPage channel={channel} post={post} rows={rows}>
      {props.renderDefault(props)}
    </PostPage>
) : (
    <div className="blog-post-form">
      <div className="blog-article">
        <div className="blog-sec blog-article-mast">
          <ArticleByline
            publishedAt={publishedAt}
            channel={channelValue}
            names={names.join(", ")}
          />
          <hr className="blog-article-rule" />
          <div className="blog-article-title-slot" ref={setTitleSlot} />
        </div>
        <div className="blog-sec blog-article-prose blog-pt">
          {props.renderDefault(props)}
        </div>
      </div>
    </div>
  );

  const shellClass = [
    "blog-post-shell",
    page ? "is-page" : "",
    settingsOpen ? "is-settings" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <SettingsRoot.Provider value={drawer}>
      <TitleRoot.Provider value={titleSlot}>
      <div
        className={shellClass}
        data-body-len={bodyLen}
        ref={shell}
      >
        <div className="blog-desk-bar">
          <button
            type="button"
            className="blog-desk-settings"
            aria-expanded={settingsOpen}
            aria-controls="blog-post-settings"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            {settingsOpen ? "Hide settings" : "Settings"}
          </button>
        </div>
        {locked ? (
          <p className="blog-desk-note" role="status">
            The text is locked. This post's footnotes are in the old format,
            and editing a paragraph would delete its notes. Run the footnote
            migration for this post, then reload. The title and the settings
            can still be edited.
          </p>
        ) : null}
        {article}
        <div
          className={
            settingsOpen
              ? "blog-settings-layer is-open"
              : "blog-settings-layer"
          }
        >
          <div
            className="blog-settings-backdrop"
            onClick={() => setSettingsOpen(false)}
          />
          <aside
            className="blog-settings-drawer"
            id="blog-post-settings"
            ref={setDrawer}
          />
        </div>
      </div>
      </TitleRoot.Provider>
    </SettingsRoot.Provider>
  );
}

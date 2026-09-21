import { useEffect, useState, type ReactNode } from "react";
import {
  set,
  useClient,
  type BlockAnnotationProps,
  type BlockDecoratorProps,
  type BlockProps,
  type BlockStyleProps,
  type FieldProps,
  type PortableTextInputProps,
  type StringInputProps,
} from "sanity";
import { CHANNEL_PATH_LABEL, type Channel } from "../lib/access";

const INTERNAL_HOSTS = /^https?:\/\/(?:[\w-]+\.)*remilia\.(?:org|com|net)\b/;

function isExternalHref(href: string): boolean {
  return /^https?:/.test(href) && !INTERNAL_HOSTS.test(href);
}

function postHref(channel: Channel, slug: string): string {
  const hostPath = CHANNEL_PATH_LABEL[channel];
  const slash = hostPath.indexOf("/");
  const path = slash >= 0 ? hostPath.slice(slash) : `/${hostPath}`;
  return `${path}/${slug}`;
}

export function ProseField(props: FieldProps): ReactNode {
  return (
    <div className="blog-prose-field">
      <span className="blog-sr">{props.title}</span>
      {props.children ?? props.renderDefault(props)}
    </div>
  );
}

export function BodyInput(props: PortableTextInputProps): ReactNode {
  return <div className="blog-pt">{props.renderDefault(props)}</div>;
}

// Must not use <p>/<h2>/blockquote — those break the contenteditable tree
// and the editor renders empty.
export function NormalStyle(props: BlockStyleProps): ReactNode {
  return <div className="blog-pt-p">{props.children}</div>;
}

export function H2Style(props: BlockStyleProps): ReactNode {
  return <div className="blog-pt-h2">{props.children}</div>;
}

export function H3Style(props: BlockStyleProps): ReactNode {
  return <div className="blog-pt-h3">{props.children}</div>;
}

export function H4Style(props: BlockStyleProps): ReactNode {
  return <div className="blog-pt-h4">{props.children}</div>;
}

export function QuoteStyle(props: BlockStyleProps): ReactNode {
  return <div className="blog-pt-quote">{props.children}</div>;
}

export function CodeDecorator(props: BlockDecoratorProps): ReactNode {
  return <code className="blog-pt-code">{props.children}</code>;
}

type PostHit = {
  _id: string;
  title: string;
  slug: string;
  channel: Channel;
};

export function LinkHrefInput(props: StringInputProps): ReactNode {
  const client = useClient({ apiVersion: "2026-02-01" });
  const href = typeof props.value === "string" ? props.value : "";
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PostHit[]>([]);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => {
      const needle = q.trim();
      if (needle.length < 2) {
        setHits([]);
        return;
      }
      void client
        .fetch<PostHit[]>(
          `*[_type == "post" && (title match $q || slug.current match $q)] | order(publishedAt desc) [0...8]{
            _id, title, "slug": slug.current, channel
          }`,
          { q: `${needle}*` },
        )
        .then((rows) => setHits(rows ?? []))
        .catch(() => setHits([]));
    }, 200);
    return () => window.clearTimeout(t);
  }, [q, client]);

  useEffect(() => {
    let alive = true;
    if (!href) {
      setPreview("");
      return;
    }
    const slug = href.split("/").filter(Boolean).pop() ?? "";
    if (!slug || /[^a-z0-9-]/.test(slug)) {
      setPreview(href);
      return;
    }
    void client
      .fetch<{ title: string; channel: Channel } | null>(
        `*[_type == "post" && slug.current == $slug][0]{title, channel}`,
        { slug },
      )
      .then((post) => {
        if (!alive) return;
        setPreview(post ? `${post.title}` : href);
      })
      .catch(() => {
        if (alive) setPreview(href);
      });
    return () => {
      alive = false;
    };
  }, [href, client]);

  const external = isExternalHref(href);

  return (
    <div className="blog-link-edit">
      {props.renderDefault(props)}
      {href ? (
        <p className="blog-link-preview">
          <span>{external ? "External" : "Internal"}</span>
          {preview}
        </p>
      ) : null}
      <input
        className="blog-link-search"
        type="search"
        value={q}
        placeholder="Search posts…"
        onChange={(e) => setQ(e.target.value)}
      />
      {hits.length > 0 ? (
        <ul className="blog-link-hits">
          {hits.map((hit) => (
            <li key={hit._id}>
              <button
                type="button"
                onClick={() =>
                  props.onChange(set(postHref(hit.channel, hit.slug)))
                }
              >
                {hit.title}
                <span>
                  {postHref(hit.channel, hit.slug)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function LinkAnnotation(props: BlockAnnotationProps): ReactNode {
  const href =
    props.value && typeof props.value.href === "string" ? props.value.href : "";
  const external = isExternalHref(href);
  const editing = props.open || props.focused;
  return (
    <>
      <span
        className={external ? "blog-pt-outlink" : "blog-pt-link"}
        title={href || "Link"}
        onClick={() => props.onOpen()}
      >
        {props.textElement}
      </span>
      {editing ? (
        <span className="blog-pt-annot-edit" contentEditable={false}>
          <span className="blog-pt-annot-edit-head">
            <strong>Link</strong>
            <button type="button" onClick={props.onClose}>
              Close
            </button>
          </span>
          {props.children}
        </span>
      ) : null}
    </>
  );
}

export function FootnoteAnnotation(props: BlockAnnotationProps): ReactNode {
  const n =
    props.value && typeof props.value.n === "number" ? props.value.n : null;
  const editing = props.open || props.focused;
  return (
    <>
      <span className="blog-pt-fn" onClick={() => props.onOpen()}>
        {props.textElement}
        <sup>{n ?? "*"}</sup>
      </span>
      {editing ? (
        <span className="blog-pt-annot-edit" contentEditable={false}>
          <span className="blog-pt-annot-edit-head">
            <strong>Footnote</strong>
            <button type="button" onClick={props.onClose}>
              Close
            </button>
          </span>
          {props.children}
        </span>
      ) : null}
    </>
  );
}

export function ImageBlock(props: BlockProps): ReactNode {
  const value = props.value as { caption?: string; alt?: string } | undefined;
  const caption =
    typeof value?.caption === "string" && value.caption.trim()
      ? value.caption
      : typeof value?.alt === "string" && value.alt.trim()
        ? value.alt
        : "";
  return (
    <div className="blog-pt-figure">
      {props.renderDefault(props)}
      {caption ? <div className="blog-pt-caption">{caption}</div> : null}
    </div>
  );
}

export function VideoBlock(props: BlockProps): ReactNode {
  return <div className="blog-pt-video">{props.renderDefault(props)}</div>;
}

export function DividerBlock(props: BlockProps): ReactNode {
  return <div className="blog-pt-divider">{props.renderDefault(props)}</div>;
}

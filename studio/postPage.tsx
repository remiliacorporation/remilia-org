import {
  createContext,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Channel } from "../lib/access";
import { RAIL_PAGE } from "../packages/renderer/src/nav";
import { CHANNEL_ORIGIN } from "../packages/seo/src/index";
import { frameParts, type FramePost, type FrameRow } from "./frameParts";
import {
  FRAME_CLASS,
  PAGE_CSS,
  frameHtml,
  frameTheme,
} from "./pageFrame";
import { SidenotesShown, marginShown, sidenoteStacker } from "./sidenotes";

/** Where the post's title field renders (studio/postInput.tsx TitleField). */
export const TitleRoot = createContext<HTMLElement | null>(null);

/** The page frame's slots the editor fills, found once the frame mounts. */
interface FrameSlots {
  root: HTMLElement;
  byline: HTMLElement;
  title: HTMLElement;
  prose: HTMLElement;
  /** The left rail's stack: the contents box, then the cite box. */
  stack: HTMLElement | null;
  /** The masthead's tools row, shown on narrow pages. */
  mastTools: HTMLElement | null;
  /** The box around the previous and next links. */
  adjacent: HTMLElement | null;
}

/**
 * Shows one page of the rail's post list and returns the page shown. The
 * site's nav.js pages the list the same way (`off-page`, `RAIL_PAGE` posts);
 * it cannot run here, since it binds the whole document.
 */
function showRailPage(root: HTMLElement, page: number): number {
  const rail = root.querySelector(".post-nav");
  const items = [...(rail?.querySelectorAll(".nav-all > li") ?? [])];
  const pages = Math.max(1, Math.ceil(items.length / RAIL_PAGE));
  const at = Math.min(Math.max(page, 0), pages - 1);
  items.forEach((li, i) =>
    li.classList.toggle("off-page", Math.floor(i / RAIL_PAGE) !== at),
  );
  const status = rail?.querySelector(".nav-status");
  if (status) status.textContent = `${at + 1} / ${pages}`;
  const prev = rail?.querySelector<HTMLButtonElement>(".nav-prev");
  const next = rail?.querySelector<HTMLButtonElement>(".nav-next");
  if (prev) prev.disabled = at <= 0;
  if (next) next.disabled = at >= pages - 1;
  return at;
}

/**
 * What a contents link points at in the editor. The site links headings and
 * notes by id; the editor's blocks carry none, so the nth link is the nth
 * heading (or note reference) in the text.
 */
function editorTarget(root: HTMLElement, link: Element): Element | null {
  const toc = link.closest(".toc");
  if (!toc) return null;
  const nth = (links: string, targets: string): Element | null =>
    root.querySelectorAll(targets)[
      [...toc.querySelectorAll(links)].indexOf(link)
    ] ?? null;
  return link.matches(".toc-note")
    ? nth(".toc-note", ".blog-pt .blog-pt-note")
    : nth("ol a", ".blog-pt :is(.blog-pt-h2, .blog-pt-h3)");
}

let pageCssInjected = false;

function injectPageCss(): void {
  if (pageCssInjected) return;
  pageCssInjected = true;
  const style = document.createElement("style");
  style.dataset.remilia = "blog-page";
  style.textContent = PAGE_CSS;
  document.head.append(style);
}

/**
 * The blog's post page, from the renderer, with the editor in place of the
 * title, byline and body.
 */
function PageFrame(props: {
  channel: Channel;
  onSlots: (slots: FrameSlots | null) => void;
  onClick: (e: MouseEvent<HTMLDivElement>) => void;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => frameHtml(props.channel), [props.channel]);
  const { onSlots } = props;

  useInsertionEffect(injectPageCss, []);

  // The frame's markup is set here, not through dangerouslySetInnerHTML:
  // React 19 rewrites innerHTML whenever that prop's object changes, which is
  // every render, and that wiped the title, byline and body portaled in.
  useLayoutEffect(() => {
    const root = ref.current;
    if (root) root.innerHTML = html;
    const byline = root?.querySelector<HTMLElement>(".sec.mast .byline");
    const title = root?.querySelector<HTMLElement>(".sec.mast h1");
    const prose = root?.querySelector<HTMLElement>(".article-rest .prose");
    if (!root || !byline || !title || !prose) return onSlots(null);
    prose.replaceChildren();
    const stack = root.querySelector<HTMLElement>(".left-rail .left-stack");
    const mastTools = root.querySelector<HTMLElement>(".sec.mast .mast-tools");
    const adjacent = root.querySelector<HTMLElement>(
      ".article-rest > .sec.post-meta",
    );
    // Hidden until the post has neighbors to link (see PostPage).
    if (adjacent) adjacent.style.display = "none";
    onSlots({ root, byline, title, prose, stack, mastTools, adjacent });
    return () => onSlots(null);
  }, [html, onSlots]);

  // Sanity's form container caps the form at 640px plus gutters, which would
  // hold the page at its phone layout. Lift the cap (and its padding) on the
  // frame's ancestors up to the pane's scroller, so the page lays out at the
  // pane's width with the blog background around it, as on the site.
  useLayoutEffect(() => {
    const lifted: [HTMLElement, string][] = [];
    for (
      let el = ref.current?.parentElement;
      el && el.dataset.testid !== "document-panel-scroller";
      el = el.parentElement
    ) {
      if (getComputedStyle(el).maxWidth === "none") continue;
      lifted.push([el, el.style.cssText]);
      el.style.maxWidth = "none";
      el.style.paddingInline = "0";
      el.style.paddingBlock = "0";
    }
    return () => {
      for (const [el, css] of lifted) el.style.cssText = css;
    };
  }, []);

  return (
    <div
      ref={ref}
      className={FRAME_CLASS}
      {...frameTheme(props.channel)}
      onClick={props.onClick}
    />
  );
}

/**
 * The post edited inside its blog page: the title field renders in the mast's
 * h1, the rest of the form fills the prose, and the byline, the rails, and
 * the adjacent links follow the post and its section's other posts (`rows`).
 */
export function PostPage(props: {
  channel: Channel;
  post: FramePost;
  rows: FrameRow[];
  children: ReactNode;
}): ReactNode {
  const { channel, post, rows } = props;
  const [slots, setSlots] = useState<FrameSlots | null>(null);
  const railPage = useRef(0);
  const parts = useMemo(
    () => frameParts(channel, rows, post),
    [channel, rows, post],
  );

  useEffect(() => {
    if (slots) slots.byline.innerHTML = parts.byline;
  }, [slots, parts.byline]);

  useEffect(() => {
    if (slots?.stack) slots.stack.innerHTML = `${parts.toc}\n${parts.cite}`;
  }, [slots, parts.toc, parts.cite]);

  useEffect(() => {
    if (slots?.mastTools) slots.mastTools.innerHTML = parts.mastTools;
  }, [slots, parts.mastTools]);

  useEffect(() => {
    const rail = slots?.root.querySelector(".right-rail > .post-nav");
    if (!slots || !rail) return;
    rail.outerHTML = parts.rail;
    railPage.current = showRailPage(slots.root, railPage.current);
  }, [slots, parts.rail]);

  // The site leaves the box out when a post has no neighbors.
  useEffect(() => {
    if (!slots?.adjacent) return;
    slots.adjacent.innerHTML = parts.adjacent;
    slots.adjacent.style.display = parts.adjacent ? "" : "none";
  }, [slots, parts.adjacent]);

  // Notes stand in the margin while the frame shows both rails. The layout
  // script places them. It runs again when the frame, the text, or the
  // right rail's boxes (the notes start under them) change size, when the
  // text or a note changes, and when the note held open (fn-pin) changes;
  // never for a scroll, a caret move, or a selection. A run that finds the
  // layout as it stands writes nothing.
  const [margin, setMargin] = useState(false);
  useEffect(() => {
    if (!slots) return;
    const { root, prose } = slots;
    const wide = () => marginShown(root);
    const done = new AbortController();
    const stack = sidenoteStacker(root, wide, done.signal);
    let frame = 0;
    let glide = false;
    const run = (open = false) => {
      glide ||= open;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setMargin(wide());
        stack(glide);
        glide = false;
      });
    };
    const sizes = new ResizeObserver(() => run());
    sizes.observe(root);
    sizes.observe(prose);
    const rail = root.querySelector(".right-rail");
    if (rail) sizes.observe(rail);
    // Sanity changes class names in the text on every caret move; of
    // those, only a mark's fn-pin moves a note. The script's own writes
    // are styles and data attributes, which this does not watch.
    const pinned = (r: MutationRecord) =>
      r.type === "attributes" &&
      (r.oldValue ?? "").split(" ").includes("fn-pin") !==
        (r.target as Element).classList.contains("fn-pin");
    const text = new MutationObserver((records) => {
      const pin = records.some(pinned);
      if (pin || records.some((r) => r.type !== "attributes")) run(pin);
    });
    text.observe(prose, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
      attributeOldValue: true,
    });
    void document.fonts?.ready.then(() => run());
    run();
    return () => {
      cancelAnimationFrame(frame);
      done.abort();
      sizes.disconnect();
      text.disconnect();
    };
  }, [slots]);

  // Links in the frame open the live site in a new tab rather than leaving
  // the Studio; a contents link moves to its heading in the editor.
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    if (!target.closest || target.closest(".blog-pt")) return;
    const root = e.currentTarget;
    const pager = target.closest(".nav-prev, .nav-next");
    if (pager) {
      const step = pager.matches(".nav-next") ? 1 : -1;
      railPage.current = showRailPage(root, railPage.current + step);
      return;
    }
    const link = target.closest("a[href]");
    if (!link) return;
    e.preventDefault();
    const href = link.getAttribute("href") ?? "";
    if (href.startsWith("#")) {
      editorTarget(root, link)?.scrollIntoView({ block: "center" });
      const toggle = root.querySelector<HTMLInputElement>("#toc-toggle");
      if (toggle) toggle.checked = false;
      return;
    }
    // The page's own links are site-relative; resolve them on the live host.
    window.open(
      new URL(href, `${CHANNEL_ORIGIN[channel]}/`).href,
      "_blank",
      "noopener",
    );
  };

  return (
    <>
      <PageFrame channel={channel} onSlots={setSlots} onClick={onClick} />
      {slots
        ? createPortal(
            <TitleRoot.Provider value={slots.title}>
              <SidenotesShown.Provider value={margin}>
                <div className="blog-article-prose blog-pt">
                  {props.children}
                </div>
              </SidenotesShown.Provider>
            </TitleRoot.Provider>,
            slots.prose,
          )
        : null}
    </>
  );
}

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
import {
  FRAME_CLASS,
  PAGE_CSS,
  frameByline,
  frameHtml,
  frameTheme,
} from "./pageFrame";

/** Where the post's title field renders (studio/postInput.tsx TitleField). */
export const TitleRoot = createContext<HTMLElement | null>(null);

/** The page frame's slots the editor fills, found once the frame mounts. */
interface FrameSlots {
  byline: HTMLElement;
  title: HTMLElement;
  prose: HTMLElement;
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
 * title, byline and body. Links in the frame open the live site in a new tab
 * rather than leaving the Studio.
 */
function PageFrame(props: {
  channel: Channel;
  onSlots: (slots: FrameSlots | null) => void;
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
    if (!byline || !title || !prose) return onSlots(null);
    prose.replaceChildren();
    onSlots({ byline, title, prose });
    return () => onSlots(null);
  }, [html, onSlots]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const link = (e.target as Element).closest?.("a[href]");
    if (!link || link.closest(".blog-pt")) return;
    e.preventDefault();
    window.open((link as HTMLAnchorElement).href, "_blank", "noopener");
  };

  return (
    <div
      ref={ref}
      className={FRAME_CLASS}
      {...frameTheme(props.channel)}
      onClick={onClick}
    />
  );
}

/**
 * The post edited inside its blog page: the title field renders in the mast's
 * h1, the byline follows the post, and the rest of the form fills the prose.
 */
export function PostPage(props: {
  channel: Channel;
  publishedAt: unknown;
  names: string;
  children: ReactNode;
}): ReactNode {
  const { channel, publishedAt, names } = props;
  const [slots, setSlots] = useState<FrameSlots | null>(null);

  useEffect(() => {
    if (!slots) return;
    slots.byline.innerHTML = frameByline({ channel, publishedAt, names });
  }, [slots, channel, publishedAt, names]);

  return (
    <>
      <PageFrame channel={channel} onSlots={setSlots} />
      {slots
        ? createPortal(
            <TitleRoot.Provider value={slots.title}>
              <div className="blog-article-prose blog-pt">{props.children}</div>
            </TitleRoot.Provider>,
            slots.prose,
          )
        : null}
    </>
  );
}

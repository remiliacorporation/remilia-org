/**
 * Runs inside the Presentation tool's preview frame (or its pop-out window).
 * Asks the Studio for the section's drafts over live mode, has the preview
 * server bake the page from them, and morphs the result into the document so
 * edits show as they are typed. Overlays come from Sanity's standalone
 * visual-editing package: stega text and image alt text are found on their
 * own; fields with no text on the page get `data-sanity` targets here.
 */
import { createClient, type ClientConfig } from "@sanity/client";
import { createQueryStore } from "@sanity/core-loader";
import {
  createDataAttribute,
  enableVisualEditing,
} from "@sanity/visual-editing-standalone";
import { Idiomorph } from "idiomorph";

interface Config {
  projectId: string;
  dataset: string;
  studioUrl: string;
  query: string;
  channel: string | null;
  slug: string;
}

interface Post {
  slug?: string;
  markdown?: string;
  commentary?: unknown[];
  albums?: unknown[];
  coverRef?: string;
  body?: { _type?: string; _key?: string; asset?: { _ref?: string } }[];
}

interface LiveData {
  posts: Post[];
  org: unknown;
  doc?: { _id: string; _type: string } | null;
}

const config = JSON.parse(
  document.getElementById("ve-config")?.textContent ?? "{}",
) as Config;
const inStudio = window.self !== window.top || Boolean(window.opener);

/**
 * Values the renderer compares or turns into URLs stay clean; stega would
 * change their meaning. Author and tag names point at their own documents,
 * so the byline is wired to the post's `authors` field instead.
 */
const LOGIC_FIELDS = new Set([
  "style",
  "listItem",
  "marks",
  "origin",
  "migrationSource",
  "aliases",
  "legacyUrl",
  "kind",
  "level",
]);

const stega: ClientConfig["stega"] = {
  enabled: true,
  studioUrl: config.studioUrl,
  filter: (props) => {
    const path = props.sourcePath;
    if (path.some((segment) => typeof segment === "string" && LOGIC_FIELDS.has(segment)))
      return false;
    const type = (props.sourceDocument as { _type?: string } | undefined)?._type;
    if (type === "author" || type === "tag") return false;
    return props.filterDefault(props);
  },
};

function note(message?: string): void {
  const el = document.getElementById("ve-note");
  if (!el) return;
  if (message) {
    const text = document.getElementById("ve-message");
    if (text) text.textContent = message;
  }
  el.hidden = false;
}

let rendered = false;
let navLoaded = false;
let lastData: LiveData | undefined;
let inflight: AbortController | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

/** `image-<hash>-WxH-ext` → `<hash>`, which every CDN URL of the image carries. */
function assetHash(ref: string | undefined): string | undefined {
  return ref ? /^image-([a-f0-9]+)-/.exec(ref)?.[1] : undefined;
}

/** Edit targets for page parts that carry no stega text. */
function annotate(data: LiveData): void {
  const doc = data.doc;
  if (!doc) return;
  const id = doc._id.replace(/^drafts\./, "");
  const attr = createDataAttribute({ id, type: doc._type, baseUrl: config.studioUrl });
  const mark = (selector: string, path: string) => {
    for (const el of document.querySelectorAll<HTMLElement>(selector))
      el.dataset.sanity = attr(path);
  };
  mark(".article-body .byline .author", "authors");
  mark(".article-body .byline-date", "publishedAt");
  mark(".article-body .byline-cat", "channel");

  const post = data.posts.find((p) => p.slug === config.slug);
  if (!post) return;
  const images: [string, string][] = [];
  const cover = assetHash(post.coverRef);
  if (cover) images.push([cover, "coverImage"]);
  for (const block of post.body ?? []) {
    const hash = assetHash(block.asset?._ref);
    if (hash && block._key) images.push([hash, `body[_key=="${block._key}"]`]);
  }
  for (const img of document.querySelectorAll<HTMLImageElement>(".article-body img")) {
    const hit = images.find(([hash]) => img.src.includes(hash));
    const figure = img.closest("figure");
    if (hit && figure && !figure.dataset.sanity) figure.dataset.sanity = attr(hit[1]);
  }
}

function apply(html: string, data: LiveData): void {
  const next = new DOMParser().parseFromString(html, "text/html");
  if (!rendered) {
    for (const { name, value } of [...next.documentElement.attributes])
      document.documentElement.setAttribute(name, value);
    const keep = new Set(
      [...document.head.querySelectorAll("#ve-config, script[src='/__ve/client.js']")],
    );
    for (const el of [...document.head.children]) if (!keep.has(el)) el.remove();
    for (const el of [...next.head.children]) {
      // Scripts parsed by DOMParser never run; the theme script and JSON-LD
      // are not needed to edit.
      if (el.tagName === "SCRIPT") continue;
      document.head.append(document.importNode(el, true));
    }
  } else {
    document.title = next.title;
  }
  Idiomorph.morph(document.body, next.body, { morphStyle: "innerHTML" });
  annotate(data);
  if (!navLoaded) {
    navLoaded = true;
    for (const old of next.body.querySelectorAll<HTMLScriptElement>("script[src]")) {
      const script = document.createElement("script");
      script.src = old.src;
      script.defer = true;
      document.body.append(script);
    }
  }
  rendered = true;
}

/**
 * Only the page on screen needs its body; the rest of the section feeds the
 * rail, listings and link cards from titles, dates and covers. Dropping the
 * other bodies keeps each re-bake well under a second.
 */
function forPage(data: LiveData): LiveData {
  return {
    ...data,
    posts: data.posts.map((p) =>
      p.slug === config.slug
        ? p
        : { ...p, body: [], markdown: undefined, commentary: undefined, albums: [] },
    ),
  };
}

async function render(data: LiveData): Promise<void> {
  inflight?.abort();
  const controller = new AbortController();
  inflight = controller;
  try {
    const res = await fetch("/__ve/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pathname: location.pathname, data: forPage(data) }),
      signal: controller.signal,
    });
    if (res.status === 409 || controller.signal.aborted) return;
    if (!res.ok) {
      if (!rendered) note(await res.text());
      return;
    }
    const html = await res.text();
    if (!controller.signal.aborted) apply(html, data);
  } catch (error) {
    if (!controller.signal.aborted) console.error(error);
  }
}

function schedule(data: LiveData): void {
  lastData = data;
  clearTimeout(timer);
  timer = setTimeout(() => void render(data), rendered ? 80 : 0);
}

if (!config.channel) {
  note();
} else if (!inStudio) {
  note();
} else {
  const client = createClient({
    projectId: config.projectId,
    dataset: config.dataset,
    apiVersion: "2026-02-01",
    useCdn: false,
    perspective: "drafts",
    stega,
  });
  const store = createQueryStore({ client: false, ssr: true });
  store.enableLiveMode({
    client,
    onDisconnect: () => {
      if (!rendered) note("Lost the connection to the Studio. Reload the preview.");
    },
  });
  const $page = store.createFetcherStore<LiveData>(
    config.query,
    { channel: config.channel, slug: config.slug, includeFuture: true },
    { data: undefined as unknown as LiveData, sourceMap: undefined, perspective: "drafts" },
  );
  $page.subscribe((state) => {
    if (state.data && Array.isArray(state.data.posts)) schedule(state.data);
  });

  enableVisualEditing({
    zIndex: 1000,
    history: {
      subscribe: (navigate) => {
        navigate({ type: "replace", url: location.pathname + location.search });
        const onPop = () => navigate({ type: "pop", url: location.pathname + location.search });
        addEventListener("popstate", onPop);
        return () => removeEventListener("popstate", onPop);
      },
      update: (update) => {
        if (update.type === "pop") history.back();
        else if (update.url !== location.pathname + location.search) location.assign(update.url);
      },
    },
    refresh: (payload) => {
      // Live mode already streams every edit; only the refresh button re-bakes.
      if (payload.source === "manual" && lastData) return render(lastData);
      return Promise.resolve();
    },
  });
}

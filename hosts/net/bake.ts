import {
  CHANNEL_BASEPATH,
  HOST_AGGREGATE,
  NET_MOVED_TO,
  NET_SECTIONS,
} from "@remilia/seo";
import { runMovedHostBake } from "../core/bake-host";

// blog.remilia.net's posts moved to Devblog on remilia.org, so this site
// bakes no pages: every old URL 301s to the same path under
// remilia.org/blog/devblog. That covers Updates at /updates, the Dev blog at
// /dev-blog and the pooled index at the root, each with its posts, archives,
// feeds and maps.
runMovedHostBake({
  name: "blog.remilia.net",
  outDir: "deploy-net",
  moves: [...NET_SECTIONS, HOST_AGGREGATE.net].map((c) => ({
    from: CHANNEL_BASEPATH[c],
    to: NET_MOVED_TO,
  })),
  // blog.miladychan.org (Ghost) is a domain alias of this site: each of its
  // posts 301s to its Devblog post, every other path to the Devblog index.
  legacyHost: {
    origin: "https://blog.miladychan.org",
    channels: [...NET_SECTIONS, NET_MOVED_TO],
  },
});

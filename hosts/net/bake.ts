import { NET_SECTIONS } from "@remilia/seo";
import { runHostBake } from "../core/bake-host";

// blog.remilia.net is all blog: the pooled index at the root, Updates at
// /updates, the Dev blog at /dev-blog. remilia.net's product pages are not
// built here.
runHostBake({
  name: "net",
  sections: NET_SECTIONS,
  outDir: "deploy-net",
  aggregate: NET_SECTIONS,
  // blog.miladychan.org (Ghost) is a domain alias of this site.
  legacyHost: { origin: "https://blog.miladychan.org", channels: NET_SECTIONS },
});

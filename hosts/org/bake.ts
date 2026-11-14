import { HOST_POOLED, ORG_SECTIONS } from "@remilia/seo";
import { runHostBake } from "../core/bake-host";

runHostBake({
  name: "org",
  sections: ORG_SECTIONS,
  outDir: "deploy",
  // The sections share one pooled index at /blog ("All"). Press is not in
  // it: press releases and coverage list only under /blog/press. The old
  // top-level section paths 301 to /blog/<section>.
  aggregate: HOST_POOLED.org,
  movedFrom: {
    updates: "/updates",
    press: "/press",
    thought: "/thought",
    archive: "/archive",
  },
  // blog.remilia.org (Ghost) is a domain alias of this site. A post that
  // moved to remilia.org/blog 301s to it; every other path on that host,
  // including Ghost posts now filed under remilia.com or blog.remilia.net
  // sections (not served from this site), lands on remilia.org/blog.
  legacyHost: { origin: "https://blog.remilia.org", channels: ORG_SECTIONS },
  // The corporate pages ship from this repo too, so every internal link
  // should resolve inside the published tree.
  linkOrigin: "https://remilia.org",
});

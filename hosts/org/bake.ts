import { ORG_SECTIONS } from "@remilia/seo";
import { runHostBake } from "../core/bake-host";

runHostBake({
  name: "org",
  sections: ORG_SECTIONS,
  outDir: "deploy",
  // The four sections are one shared blog surface — it gets an aggregate
  // index at /blog and the old top-level section paths 301 to it.
  aggregate: ORG_SECTIONS,
  movedFrom: {
    updates: "/updates",
    press: "/press",
    thought: "/thought",
    archive: "/archive",
  },
  // The corporate pages ship from this repo too, so every internal link
  // should resolve inside the published tree.
  linkOrigin: "https://remilia.org",
});

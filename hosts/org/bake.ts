import {
  COM_POST_SECTIONS,
  NET_SECTIONS,
  ORG_SECTIONS,
} from "@remilia/seo";
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
  // blog.remilia.org (Ghost) is a domain alias of this site. Its posts went
  // to every host, so the rules cover all sections, not just org's.
  legacyHost: {
    origin: "https://blog.remilia.org",
    channels: [...ORG_SECTIONS, ...COM_POST_SECTIONS, ...NET_SECTIONS],
  },
  // The corporate pages ship from this repo too, so every internal link
  // should resolve inside the published tree.
  linkOrigin: "https://remilia.org",
});

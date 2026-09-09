import { NET_SECTIONS } from "@remilia/seo";
import { runHostBake } from "../core/bake-host";

// Blog sections only: remilia.net's product pages are not built here, so
// `deploy-net` holds `/updates` and `/blog` and nothing else.
runHostBake({
  name: "net",
  sections: NET_SECTIONS,
  outDir: "deploy-net",
});

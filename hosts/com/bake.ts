import { COM_POST_SECTIONS } from "@remilia/seo";
import { runHostBake } from "../core/bake-host";

// Blog sections only: remilia.com's storefront and brand pages are not built
// here, so `deploy-com` holds `/a/news` and `/a/events` and nothing else.
runHostBake({
  name: "com",
  sections: COM_POST_SECTIONS,
  outDir: "deploy-com",
});

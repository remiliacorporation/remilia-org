import { COM_POST_SECTIONS } from "@remilia/seo";
import { runHostBake } from "../core/bake-host";

// Blog sections only: remilia.com is a Shopify store, and its app proxy serves
// this output at remilia.com/a/blog, so `deploy-com` holds `/a/blog` and
// nothing else.
runHostBake({
  name: "com",
  sections: COM_POST_SECTIONS,
  outDir: "deploy-com",
  // News and Events share one pooled index at /a/blog, as org's do at /blog.
  aggregate: COM_POST_SECTIONS,
});

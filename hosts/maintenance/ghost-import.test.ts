import { test } from "node:test";
import assert from "node:assert/strict";
import { fullImageUrl, ghostHtmlToMarkdown } from "./ghost-import";

test("Ghost HTML becomes Markdown the PT compiler can eat", () => {
  const md = ghostHtmlToMarkdown(
    `<p>See <a href="https://blog.remilia.org/other-post/">other</a> and <strong>bold</strong>.</p><figure class="kg-card kg-image-card"><img src="https://cdn.example/a.jpg" alt="Flyer"></figure><h2>Head</h2>`,
  );
  assert.match(md, /\[\[other-post\|other\]\]/);
  assert.match(md, /\*\*bold\*\*/);
  assert.match(md, /!\[Flyer\]\(https:\/\/cdn\.example\/a\.jpg\)/);
  assert.match(md, /## Head/);
});

test("galleries emit every image; sized Ghost URLs unwrap", () => {
  assert.equal(
    fullImageUrl(
      "https://storage.ghost.io/x/content/images/size/w600/2025/03/P.jpg",
    ),
    "https://storage.ghost.io/x/content/images/2025/03/P.jpg",
  );
  const md = ghostHtmlToMarkdown(
    `<figure class="kg-card kg-gallery-card"><img src="https://cdn.example/size/w600/a.jpg" alt="A"><img src="https://cdn.example/b.jpg" alt="B"></figure>`,
  );
  assert.match(md, /!\[A\]\(https:\/\/cdn\.example\/a\.jpg\)/);
  assert.match(md, /!\[B\]\(https:\/\/cdn\.example\/b\.jpg\)/);
});

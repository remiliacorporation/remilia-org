# Content review — imported posts (Sanity `8x9419lh` / `production`)

Audit of all 144 `post` documents (2026-09-14). Posts were imported from
Ghost (`blog.remilia.org`), miladychan (`blog.miladychan.org`), and Obsidian
vault markdown. Findings below are grouped by type; each item lists affected
docs and the correction to make. Confirm editorial calls (channel moves,
title rewrites) before bulk-applying — some may be intentional style.

## Status — applied 2026-09-15 via `fix/apply.mjs` + `fix/editorial.mjs` + `fix/footnotes.mjs` + `fix/fn-cleanup.mjs`

Round 3 (footnote conversion + dead-link repair):

- **16 posts converted** to native `footnote` markDefs (glyph `¹`,
  paren `⁽N⁾`, escaped `\[N\]`, and bare `[N]` markers all handled):
  175 note refs total across 21 posts now render as numbered popover
  footnotes via the existing `.fn`/`.fn-ref`/`.fn-note` markup —
  verified in baked HTML.
- **Cleanup pass**: orphan `⁾`/`⁽` chars stripped (kali-acc had markers
  split across span boundaries); 4 dangling terminal "Footnotes" headings
  dropped (warholian, cancel-miya, four-notes, lightweight-travel);
  nouns-wtf's mangled `1]:` note repaired (def text fixed, unescaped `[2]`
  marker converted, note tail removed); viral-public-license's unescaped
  `[1]`/`[2]`/`[3]` markers converted and tail removed.
- **4 channel-mismatched interlinks fixed**: bodies linked `/blog/press/*`
  for posts that now live in `archive`/`thought` (urbit-cloud-host,
  pfpnfts, secondary-royalties, on-secondary). Bake link check now clean.
- **Lost note bodies recovered from paragraph.com originals**
  (`fix/fn-restore.mjs`): `reality-after-the-wired` notes 1–5 restored
  (note 6 was nested inside note 2 on the source — appended within note
  2's text since markDefs can't nest); `angelicism01` real markers
  `\[1\]`/`\[1\]`/`\[2\]` converted — the "42 markers" were actually a
  numbered link list (`[1]`–`[42]` → 42 intact Twitter links, escape junk
  stripped); orphan note 3 kept as text under the Footnotes heading (no
  marker on the source either).
- **5 leftover guest-post bylines removed** (escaped-bracket variant the
  editorial pass missed): acc03871…(minds0n), auction-core-gp,
  four-notes-…-gp, milady-as-a-total-art-gp, things-desired-…-gp — guest
  authors were already attached.

### Round 4 — footnote deep-repair (`fix/fn-repair.mjs`)

- **17 duplicate refs in kali-acc removed**: `⁽N⁾` markers had been
  double-matched by overlapping paren+glyph regexes, producing two defs
  per marker (34 → 17 real notes 1–17).
- **8 lost notes restored**: kali-acc notes 18–25 were consumed as orphans
  but never re-emitted — now appended as trailing sidenote defs
  (`n:18`–`n:25`) under a Footnotes heading.
- **Heading-as-note corruption fixed**: in posts whose notes sections were
  unnumbered paragraphs, the "Footnotes" heading itself had been parsed as
  note 1, shifting every marker's text. Rebuilt from `posts.before` source
  notes: hot-pot (5), can-whats-playing (9, incl. source's 5-before-4
  ordering), jadeposting (3 + orphan notes 4–5 → trailing), dynasty-mindset
  (6 + orphan note 6 → trailing), redacted-remilio-babies (8).
- **network-angels**: the `\[1\].` note-header block had itself been
  converted to a footnote — dropped; note 1 is empty on the source.
- **New `n` field on the footnote markDef** (optional source note number):
  pins the rendered ref label + `fn-N` id so non-sequential ordering
  (can-whats `1,2,3,5,4…`), re-referenced notes (angelicism `1` twice,
  dynasty `4` twice), and unmarked trailing notes keep source numbering.
- **In-note cross-references now link**: `fnHtml` linkifies `⁽N⁾`/`[N]`
  inside note text to `#fn-N` when that note exists — kali's `⁽²³⁾`/`⁽²⁴⁾`
  inside note 12 resolve to the trailing sidenotes; reality's `[6]` inside
  note 2 resolves to its own sidenote (previously embedded text; now
  un-nested per design). Verified: 8 in-note links in kali, 2 in reality,
  zero dead anchors.

### Round 4b — image-bodied notes (`fix/fn-repair2.mjs`)

- **The "empty" notes weren't empty — their bodies were images.** Added an
  optional `image` field to the footnote markDef (renders inside the note
  alongside text). Bound the stranded tail images to their notes:
  cancelled-will notes 1, 6 ("How are you still standing?"), 10; VPL note 3;
  network-angels note 1; dynasty note 7 (trailing sidenote). Zero
  truly-empty defs remain — 171 footnote defs total.
- **angelicism01 @247**: an intact `![alt](papyrus_images/…)` Paragraph
  image still inline as markdown — uploaded to Sanity, now a real image
  block with the alt text as caption; the duplicated caption paragraph
  dropped.
- **Markdown-image residue**: stray `!` and `")` blocks around converted
  images removed (jadeposting ×4, redacted-remilio ×3, what-remilia-believes
  ×1); two image alts missing their closing paren repaired.
- **Bare YouTube-embed URLs** (jadeposting, neogyaru) converted to links —
  flagged: these want a real embed/video treatment if desired; they were
  invisible as plain text before.
- **Flagged — empty notes on source**: cancelled-will notes 1 & 10 and
  viral-public-license note 3 carry empty `footnote` text — empty on the
  original too (VPL note 3 on paragraph.com is a bare `[3]`, likely held
  the closing illustration). Marker refs preserved, popover empty.
- **Known limitation**: kali-acc note bodies contain nested `⁽N⁾`
  references to other footnotes — kept as literal superscript text since
  markDefs can't nest.
- `fix/dump.mjs` added — re-dumps all 144 posts (drafts+published) to
  `posts/*.json|.txt` after each mutation phase so fixes never operate on
  stale state.

Residual findings now 26 across 16 posts: 18 bare-url spans that are
intentional link annotations, 4 mojibake false positives (`™`/`’` are
intentional styling), 2 real-title `-2` slugs, 2 informational alias notes.

Round 2 (dead-upstream recovery + editorial pass):

- **Recovered 32 dead assets**: 28 visla.kr images via Wayback Machine
  (`fix/visla-recovery.json` — lookbook shots, NFT PFP slider, Seoul rave
  photos) + 4 expired Instagram CDN images via fresh signed URLs
  (`fix/ig-recovery.json` — @samanthaquick_ Banopticon post in the Dazed
  snapshot). All uploaded to Sanity and rewritten in snapshots.
- **Chrome dropped**: IG avatar, myriad.markets widget avatar, VISLA author
  avatar + outlet logo, 25 captcha images — `fix/drops.json`.
- **Dead links**: 26 visla.kr tag/author/feature links → wayback-wrapped;
  `t.co/lbkSbo5xFl` → `981.jp`; `https:// http://` double-scheme fixed.
- **Guest posts → authors**: 9 `author-*` docs created (@minds0n,
  @Milady_Sonoro, @paultristis, @scearpo, @lb_dobis, @proanatwink,
  @EschatoIogies, @gentlest_alive, @ongestalte), set on posts, `[gp]`/
  `[Guest post: @x]` title markers + byline lines removed.
- **Titles**: 41 normalized to Title Case (type prefixes `Press Release:`/
  `Feature:`/`Interview:`/`Cultural Coverage:`/etc. stripped — channel/outlet
  carry that; ALLCAPS → Title Case). Style rule: store Title Case, render
  uppercase via CSS (`text-transform` still TODO on the blog title styles).
- **Channels**: `news`×7 → `press`, `dev-updates`×2 → `dev-blog`.
- **Slugs**: 3 collision-suffix renames (`33reisen` date fix `06-2024→06-2023`,
  `warholian-groupchat`, `remilianet v0.7`) with `/events/…` + `/dev-blog/…`
  previousPaths aliases; 2 kept (`Milady Rave 2`, `Level-2` are real titles).
- **Structure**: 3 dangling mark refs dropped (spans pointing at defs removed
  by earlier cleanups), split-span `![]()`s merged and converted
  (mm_shypost.png, realtime_index-2.jpg), YouTube `![]()`s → links.
- **Excerpts**: 8 regenerated from first real paragraph (skips TOC/list/heading
  blocks). Image alts filled on dev-blog posts.

Residual (37 findings, mostly by-design or deferred): 18 bare-url spans that
ARE link annotations (text reads as URL — intended), 9 glyph-footnote `¹`
markers (need marker↔note pairing — editorial), 4 mojibake false positives
(™ ’), 2 real-title `-2` slugs kept, 2 informational alias notes, `t.co`
to a deleted tweet kept as historical record.

Round 1 (kept for the record):

Committed to the dataset (143 posts patched, 27 albums created, ~195 assets
mirrored to Sanity; pre-state backups in `posts.before/`):

- 380 link hrefs cleaned (tracking params, `&&`, `http://https//`, scheme-less,
  `{{DOMAIN}}` dropped, `blog.remilia.org` internal links repointed to `/blog/…`,
  `/press|updates|…/` relatives repointed to `/blog/…`)
- 53 markdown `[text](url)` → link annotations; 16 bare URLs → links
- 6 `![](ghost.io)` text images → Sanity `image` blocks; 6 mirror-media
  hotlinks → `image` blocks with captions; 1 ghost mp4 → `video` block
- 27 `album` docs created from events' inline image runs, attached via
  `post.albums` (lightbox gallery now active once posts publish)
- 14 snapshot posts' `![](third-party)` images mirrored to `cdn.sanity.io`;
  25 captcha junk images stripped
- 14 titles trimmed; 3 `Subscribe` blocks removed; 3 guest-post bylines
  normalized; 3 embed-chrome fragments dropped
- 2 hash slugs → real slugs with aliases; legacyUrl≠slug aliases added

**Code fixes alongside**: `video` block in blockContent + renderer + `.md`
export; `.md` raw `image-` refs → CDN URLs; per-channel legacy 301s in
`writeChannelRedirects` (was press-only, hardcoded press).

**Still flagged (needs human pass)** — `findings.md` residual (~115, incl.
known false positives): dead asset upstreams (5 expired Instagram CDN, ~30
visla.kr dead host → try Wayback, myriad.markets, `t.co` shortlinks),
editorial calls ([gp]/ALLCAPS/prefix titles ×40, 8 excerpts, 7 slug renames,
9 glyph footnotes, 6 missing image alts, guest-post text fragments),
channel reassignments, and the publish/delete decision per draft.

## 1. Publication state — corpus is unpublished

**142 of 144 posts exist only as drafts** (`drafts.post-*`). Only two are
published: `post-press-authorship-hashes` and
`post-press-corporate-memo-remilia-2024-christmas-missive` (both `updates`).

Correction: review each draft and publish or delete. Until then only
`updates` has live content; `press`/`thought`/`archive`/`events`/`news`/
`dev-*` are empty surfaces. This is the root cause of "updates is empty".

## 2. Ghost-URL redirects are incomplete

`writeChannelRedirects` (`packages/renderer/src/bake.ts`) emits
`blog.remilia.org/<slug>/` 301s **only inside the `press` block**, with the
target hardcoded to `canonicalFor("press", slug)`. Consequences:

- Posts migrated to `thought`/`archive`/`updates`/`events`/`dev-*` lose
  their `blog.remilia.org/<slug>/` URLs entirely — no rule is emitted.
- `migration.legacyUrl` (set on every imported post) is only honored for
  press posts.
- `blog.miladychan.org/vNN/` legacy URLs on the 4 miladychan devlogs get no
  redirect anywhere (different host — needs a rule on the net site or a
  host-level redirect).
- `aliases` (Previous paths) is empty on all 144 posts — the per-post alias
  mechanism (`aliasRules`) is unused.

Correction: emit `blog.remilia.org/<legacy-slug>/ → canonicalFor(postChannel(p), p.slug)`
for every post with a ghost `legacyUrl`, regardless of channel; decide the
miladychan.org redirect story; populate `aliases` where the old path differs
from the new slug.

## 3. Body markup leaks

- **Raw markdown image syntax as literal text**: `![](https://storage.ghost.io/...)`
  inside Portable Text spans — `dev-blog` miladychan-v01…v04. Convert to
  `image` blocks (and re-host on Sanity — the Ghost CDN is a live dependency).
- **Bare media URL as text**: `post-press-fumo-404` has a raw
  `storage.ghost.io/...mp4` URL paragraph — a video embed lost in import.
  `discord.gg/milady` bare at the end of the same post.
- **Ghost subscribe cards → stray text**: miladychan v01 ends with a bare
  "Subscribe" paragraph; check v02–v04 and other Ghost imports for signup/
  footer card remnants.
- **Raw markdown links `[text](url)` in text**: pattern `](http` appears in
  ~25 bodies (incl. `corporate-memo`, `external-memo`, `how-to-torrent`,
  `ethereum-starter-pack`, `auction-core-gp`, `urbit-*`, press releases).
  Convert to `link` markDefs.
- **Superscript-glyph footnotes**: `a-peoples-history-of-hot-pot` uses `¹`
  inline; verify the footnote body exists and renders, and convert other
  glyph footnotes to the `[^n]` syntax the renderer supports.

## 4. Media must be self-hosted on Sanity — not linked/embed

Policy: every image and video is a Sanity asset (`sanity.imageAsset` /
`sanity.fileAsset`) referenced by blocks — never a hotlink, never an embed
card. Current state:

- 721 `sanity.imageAsset` docs exist; body `image` blocks and all cover
  images already use asset refs (no broken refs found). Good baseline.
- **Not self-hosted yet:**
  - `storage.ghost.io` URLs as *literal text* — miladychan-v01…v04 gifs/pngs,
    `fumo-404` mp4. Download → upload to Sanity → replace text with `image`
    blocks (mp4 needs the video block below).
  - `images.mirror-media.xyz` publication images stored as **link markDefs**
    with markdown `"title"` text baked into the href —
    `jadeposting`, `redacted-remilio-babies`, `what-remilia-believes-in`,
    `network-spirituality-collected-commentaries`. Re-upload to Sanity and
    convert to image blocks with captions.
  - `storage.googleapis.com/papyrus_images/…jpg` + `paragraph.com/editor/
    twitter/{logo,heart}.png` links in `notes-towards-a-study-of-remilia-s-art`
    — this is a **mangled Paragraph Twitter-embed card**: a @Milady_Sonoro
    tweet embed imported as `![User Avatar](…)`/`![Twitter Logo](…)`/
    `![Like Icon](…)` markdown fragments pointing at Paragraph's editor CDN
    and UI chrome, followed by the leftover `](twitter.com/…status…)`
    tail. Replace with a clean link to the tweet; the real image right
    after it already exists as a proper `image` block.
  - `{{DOMAIN}}/editor/youtube/play.png` — unresolvable Ghost editor
    placeholder links — `angelicism01-collected-commentaries`,
    `things-desired-an-egoless-online-gp`. Delete or replace with the real
    YouTube link they stood in for.
  - `archiveSnapshot` (Firecrawl markdown) on ~18 external archives contains
    `![](third-party-cdn)` images — **mirror them into Sanity** and rewrite
    the snapshot markdown to `cdn.sanity.io` URLs (self-host per policy;
    snapshots are for the record so keeping the outlet's imagery is fine —
    confirm the rights call once).
- **Schema**: `video` member added to `blockContent` (Sanity `file` asset,
  `video/*` + caption + poster frame); renderer emits
  `<figure class="video"><video controls>`; `.md` export writes
  `[Video](url)`. YouTube/Twitter embeds (currently plain link annotations)
  stay links unless an embed type is wanted later.
- **Albums are the gallery model** (preferred): `post.albums[]` → `album`
  docs render as a full thumbnail grid + `<dialog>` lightbox on the event
  post — every photo is viewable inline and at full res on the post page.
  `gallery.js` ships only when an events post has albums. There is no
  standalone album page (album `slug` is unused for routing) — add one if
  a gallery index is wanted. Migration task: for each events post, create
  an `album` doc from its inline `image`-block run (carry over
  alt/caption/credit), attach via `post.albums`, then remove the inline
  blocks so photos aren't duplicated on the page.
- **`.md` export bug (fixed)**: image blocks wrote raw `image-<sha>` refs
  instead of CDN URLs — `portableTextToMarkdown`/`postToMarkdownFile` now
  take an `assetUrl` resolver wired to the Sanity CDN in `bake.ts`.

## 5. Link annotation damage

- ~~610 null `href` link markDefs~~ — **false positive**: the nulls were a
  GROQ projection artifact (markDefs=null blocks flattening into gaps).
  Direct API dump shows zero null-href link annotations.
- Tracking params on outbound links: `?ref=blog.remilia.org` /
  `?ref=blog.miladychan.org` (hundreds), Twitter `?s=…&t=…`, Substack `?s=r`.
- Malformed hrefs: `http://https//youtu.be/pBJA9gtgHv0…` (miladychan-v03),
  `youtube.com/watch?v=TEBG82-NyVQ&&ref=…` (double `&`),
  scheme-less `discord.gg/milady` and `opensubtitles.org` (relative → broken),
  `mirror.xyz/dashboard/edit/…` (a Mirror *editor* URL — dead),
  `t.co/…` shortlinks (unwrap to real URLs).
- Internal Ghost links to paths that don't exist on the new site:
  `blog.remilia.org/reviews/pfpnft` (nouns-wtf ×4),
  `blog.remilia.org/article/miladymaker` (pfpnfts ×2),
  `blog.remilia.org/article/ethereum-starter-pack/#…`. Repoint to the new
  canonical `/blog/<section>/<slug>` or the external original.
- Relative `/press/<slug>` links (milady-maker, on-secondary) — currently
  rescued by the `/press/* → /blog/press/*` 301; repoint to `/blog/...`
  directly.

## 6. Excerpts

Auto-derived excerpts leak markup/bylines:

- `acc03871dd9d605fb83eb382703a44d1d50dc08b`: `"\\ Guest post by @minds0n
  (https://twitter.com/minds0n) . \\ A.K.A."` — literal backslashes + a raw
  URL.
- `auction-core-gp`: same pattern — `"\\ Guest post by @Milady\\ Sonoro
  (https://twitter.com/Milady Sonoro) . \\ …"` — and the URL contains a
  space (broken).
- `09-2025-nyc-elena-velez…afterparty`: excerpt is a run-on credit dump
  ending mid-sentence ("…Shots from Marcus Maddox Shots from").
- `catgirl-wisdombs`: `"1.Respect Catgirl."` — ordered-list marker mashed
  into prose.

Correction: hand-write excerpts for archive/thought posts whose first
paragraph is a guest-post byline; re-derive or fix the rest.

## 7. Titles

- Whitespace: `" WHITE POOH SHIESTY'S SHOOTING VICTIM …"` (leading),
  `"CATGIRL WISDOMBS "`, `"I know that's pretty rave girl "`,
  `"oppa Cheongsam style "`, `"where is amalia ulman?  …  "` (trailing +
  double spaces), `"Notes on the New Wave of Net Art\n"` (embedded
  newline), `"The Internet Relay Chat System; "` (stray `; `).
- Guest-post attribution baked into titles: `[gp]` (Auction Core, Milady as
  a Total Art, Things Desired, Four Notes…, New Lower Bound…) and
  `[Guest post: @proanatwink/@eschatalogies/@ongestalte]`. Decide whether
  attribution moves to `authors` (guest authors aren't `author` docs) or a
  byline field.
- Redundant type prefixes in archive titles: `Cultural Coverage:`,
  `Feature:`, `Event Coverage:`, `Interview:`, `News:`,
  `Thought Leadership:` — duplicated by `outlet` + `publishedAt`. Keep or
  normalize; be consistent.
- Title/slug drift: `five-jewels` → titled "Six Lights"; `eternity-chat` →
  "groupchat love"; `warholian-groupchat-2` → "Warholian Groupchat";
  `artist-profile-palladium-…` → titled "Feature: Palladium Magazine — …".

## 8. Slugs

- Two posts have 40-hex Ghost-id slugs (slug derivation failed at import):
  `post-press-8f3077008f75b9b86586641cc1b58bdb14e3f56b` (news, "Elena Velez
  NYFW collab" excerpt) and `post-press-acc03871dd9d605fb83eb382703a44d1d50dc08b`
  (thought, "New Lower Bound of Network Spirituality"). Give them real
  slugs + `aliases`/legacy rules.
- Collision residue `-2` suffixes: `06-2024-london-33reisen-london-2` —
  slug prefix says 06-2024 but title/publishedAt say 06/2023 → rename to
  `06-2023-london-33reisen-london` (check no clash). Same for
  `warholian-groupchat-2`.
- `press-release-…` / `feature-…` / `cultural-coverage-…` slug prefixes
  duplicate the channel/type — cosmetic, optional cleanup.
- `post-press-*` document ids on 136 posts whose channel isn't press —
  cosmetic only; ids aren't public.

## 9. Events channel

- **Migrate inline photo runs → `album` docs** (per §4): create one album
  per event from its `image` blocks, attach via `post.albums`, delete the
  inline blocks. Until then `gallery.js` never ships and event pages show
  plain figures, no lightbox.
- `06-2024-london-33reisen-london-2` slug/date mismatch (§8).
- `01/2026`, `05/2026`, `08/2026` events are future-dated — fine, but
  confirm they're real scheduled events.

## 10. Channel assignments to review

- `fumo-404` ("Milady $FUMO Redux: $FUMO404 Hard Fork") sits in `thought`
  — reads as an `updates` announcement.
- `milady-maker`, `what-remilia-believes-in…`, several `press-release-*`
  posts — confirm thought vs updates vs press split.
- `news` channel: `post-press-8f3077…` and `cheeseworld-p2p-press-release`
  — confirm brand releases belong on `remilia.com/a/news` vs org `press`.
- `dev-updates` has 2 posts (`remilia-vault`, `niu-lai…`); the
  `remilianet-alpha-*` series (12 posts) is in `dev-blog` — confirm the
  net split.

## 11. Taxonomy

- Unused channel-named tags (0 posts): `Announcements`, `Archive`,
  `Events`, `Press`, `Thought`, `Note`, `Project`, `Review`, `Urbit` —
  import scaffolding; delete or fill.
- `Announcement` (9) vs `Announcements` (0) — merge.
- `Remilia` on 68/144 posts — a catch-all import tag; prune where it adds
  nothing.
- `Interview` has 1 post; check other interview pieces are tagged.
- Duplicate `org` singleton: both `org` and `drafts.org` named "Remilia
  Corporation" — publish/dedupe the draft.

## 12. Schema/field observations

- `video` member added to `blockContent` (done — self-hosted mp4/etc via
  Sanity file assets; renderer + `.md` export support it).
- `markdown` field is unused on every post (`hasMarkdown` false everywhere)
  — the vault-import lane produced no content; keep or drop the field.
- External archive entries are structurally complete (all have
  `externalUrl`, `outlet`, `archiveSnapshot`, `commentary`, `origin:
  external`); no `body` needed — verified.
- `migration.source` is set (`ghost`/`miladychan`) but `ghostId` is never
  populated — fill it if the Ghost export is re-run for reconciliation.

## Suggested review order

1. Publish/delete decision per draft (§1) — everything else is moot while
   drafts don't render.
2. Redirect plumbing fix (§2) — a code change in `writeChannelRedirects`,
   then re-bake `_redirects`.
3. Media self-hosting (§4) — video member is in place; scripted re-upload
   of every external asset (ghost.io, mirror-media, papyrus, snapshot
   images) into Sanity blocks; events photos → `album` docs for the
   lightbox gallery.
4. Bulk cleanups (§3, §5, §6): script null-href removal, param stripping,
   `![](…)` conversion, whitespace trims; hand-edit the rest in Studio.
5. Slug/channel/taxonomy decisions (§7–§11) — editorial, one pass in Studio.

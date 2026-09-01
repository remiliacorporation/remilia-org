import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanSnapshotMarkdown, stripMarketChrome } from "./clean-archive-snapshots";

test("strips Skip to content and Save Story chrome", () => {
  const md = `[Skip to main content](https://www.wired.com/#main)

Save StorySave this story

Save StorySave this story

“What do you mean my actions have consequences?”`;
  const out = cleanSnapshotMarkdown(md);
  assert.equal(out.startsWith("“What do you mean"), true);
  assert.equal(/Skip to|Save Story/i.test(out), false);
});

test("strips Spectator edition switcher fluff", () => {
  const md = `[Skip to main content](https://spectator.com/#)

US EDITION

UK EDITIONUS EDITION

content frame

# Real headline

Article body here.`;
  const out = cleanSnapshotMarkdown(md);
  assert.match(out, /^# Real headline/);
  assert.equal(/Skip to|US EDITION|content frame/i.test(out), false);
});

test("strips Forbes Digital Assets nav", () => {
  const md = `[Digital Assets](https://www.forbes.com/digital-assets/)

- [News](https://www.forbes.com/digital-assets/news/)
- [Crypto Prices](https://www.forbes.com/digital-assets/crypto-prices/)
- More

[Forbes Digital Assets](https://www.forbes.com/digital-assets/)

# Ethereum’s Vitalik Buterin Just Endorsed Controversial Milady NFT

By Boaz Sobrado`;
  const out = cleanSnapshotMarkdown(md);
  assert.match(out, /^# Ethereum/);
  assert.equal(/Digital Assets|Crypto Prices/i.test(out), false);
});

test("strips broken Instagram embed chrome", () => {
  const md = `[Skip to content](https://visla.kr/#content)

Instagram

[_Instagram_](https://www.instagram.com/p/C1KusVntlXU/)

The link to this photo or video may be broken, or the post may have been removed.

[Visit Instagram](https://www.instagram.com/p/C1KusVntlXU/)

> “Milady is cute, Milady is punk rock”`;
  const out = cleanSnapshotMarkdown(md);
  assert.match(out, /^> “Milady is cute/);
  assert.equal(/Skip to|Visit Instagram|may be broken/i.test(out), false);
});

test("stripMarketChrome still finds Decrypt article H1", () => {
  const md = `## Coin Prices

### [BTC]

$90,000

# Milady CULT Coin Finally Launched

By Ryan`;
  const out = stripMarketChrome(md);
  assert.match(out, /^# Milady CULT/);
});


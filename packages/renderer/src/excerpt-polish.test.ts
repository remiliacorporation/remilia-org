import assert from "node:assert/strict";
import { test } from "node:test";
import { smartExcerpt, plainFromBlocks } from "./excerpt";
import { parseFootnoteDump, polishBody, splitSuperscripts } from "./polish";

test("smartExcerpt ends at sentence for vessel lead", () => {
  const raw =
    "The deanonymization of polarizing internet writers has become something of a trend in the last few years: Scott Alexander, Mencius Moldbug, Bronze Age Pervert, Angelicism01. And next on the chopping block, Miya Black Hearted Cyber Angel Baby. For each of these cases, one thing is consistent: the goa";
  const out = smartExcerpt(raw, 300);
  assert.equal(out.endsWith("Baby."), true);
  assert.equal(out.includes("For each"), false);
});

test("smartExcerpt never mid-word", () => {
  const out = smartExcerpt(
    "Short words only here without period " + "x".repeat(200),
    80,
  );
  assert.equal(/\s$/.test(out) || /[a-z]$/i.test(out), true);
  assert.equal(out.includes("xx"), false);
});

test("splitSuperscripts handles multi-digit", () => {
  const parts = splitSuperscripts("high IQ¹⁵ and undersocialized");
  assert.deepEqual(parts, [
    { text: "high IQ" },
    { fn: 15 },
    { text: " and undersocialized" },
  ]);
});

test("parseFootnoteDump reads numbered notes", () => {
  const map = parseFootnoteDump(
    "1.  See: Crypto.\n    \n15.  Did you think I’d disclose my exact IQ here? Ha!\n",
  );
  assert.equal(map.get(1), "See: Crypto.");
  assert.equal(map.get(15), "Did you think I’d disclose my exact IQ here? Ha!");
});

test("polishBody: italics→blockquote, supers→footnotes, drop dump", () => {
  const body = polishBody(
    [
      {
        _type: "block",
        style: "normal",
        children: [{ _type: "span", text: "Threatened by groups³ already." }],
        markDefs: [],
      },
      {
        _type: "block",
        style: "normal",
        children: [
          {
            _type: "span",
            text: "   Possibly autistic, or maybe just high IQ¹⁵ and undersocialized. You decide. I’m a prude and respect chastity. I have low tolerance for perversions, ugliness, bitterness and general ignobility. My vice is alcohol. I believe in karma, fate and arete.",
            marks: ["em"],
          },
        ],
        markDefs: [],
      },
      {
        _type: "block",
        style: "normal",
        children: [
          { _type: "span", text: "To journalists reading this: " },
          {
            _type: "span",
            text: "my name and identity during the one-year period of June 2021 to June 2022 was Charlotte Fang, and only Charlotte Fang, pronouns she/her — a long enough sentence to qualify.",
            marks: ["em"],
          },
        ],
        markDefs: [],
      },
      {
        _type: "block",
        listItem: "bullet",
        children: [{ _type: "span", text: " ", marks: ["em"] }],
        markDefs: [],
      },
      {
        _type: "block",
        style: "normal",
        children: [
          {
            _type: "span",
            text: "1.  First note here.\n\n3.  Groups of bad actors.\n\n15.  Did you think I’d disclose my exact IQ here? Ha!",
            marks: ["em"],
          },
        ],
        markDefs: [],
      },
    ],
    "Admin Reveal",
  );
  assert.equal(body.length, 3);
  assert.equal(body[1].style, "blockquote");
  assert.equal(body[2].style, "blockquote");
  const fnDefs = (body[0].markDefs ?? []).filter((d) => d._type === "footnote");
  assert.equal(
    fnDefs.some((d) => d.text?.includes("Groups of bad actors")),
    true,
  );
  const quoteFn = (body[1].markDefs ?? []).find((d) => d._type === "footnote");
  assert.equal(
    quoteFn?.text,
    "Did you think I’d disclose my exact IQ here? Ha!",
  );
  assert.equal(
    (body[1].children ?? []).every((c) => !(c.marks ?? []).includes("em")),
    true,
  );
});

test("plainFromBlocks skips quotes", () => {
  const t = plainFromBlocks([
    { _type: "block", style: "normal", children: [{ text: "Lead sentence." }] },
    {
      _type: "block",
      style: "blockquote",
      children: [{ text: "Quoted aside." }],
    },
  ]);
  assert.equal(t, "Lead sentence.");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { suggestTags } from "./tag-taxonomy";

test("vessel admin reveal gets authorship + announcement", () => {
  const tags = suggestTags({
    title: "Admin Reveal: I said I'm just a vessel bro",
    channel: "updates",
    excerpt: "The deanonymization of polarizing internet writers… Miya Black Hearted Cyber Angel Baby.",
  });
  assert.ok(tags.includes("Announcement"));
  assert.ok(tags.includes("Authorship"));
});

test("external archive is Coverage", () => {
  const tags = suggestTags({
    title: "WIRED Explores Girl Culture Online",
    channel: "archive",
    origin: "external",
    outlet: "WIRED",
  });
  assert.ok(tags.includes("Coverage"));
});

test("events channel → Event first", () => {
  const tags = suggestTags({
    title: "01/2026 Tokyo: FRUiTS x Remilia Rave Tokyo",
    channel: "events",
    existing: ["Events"],
  });
  assert.equal(tags[0], "Event");
  assert.ok(tags.includes("Fashion") || tags.includes("Remilia") || tags.includes("Milady"));
});


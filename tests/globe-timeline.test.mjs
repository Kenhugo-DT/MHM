import assert from "node:assert/strict";
import test from "node:test";
import { visibleInTimeline } from "../site/src/globe/timeline.mjs";

test("timeline includes documented starts through the selected year", () => {
  assert.equal(visibleInTimeline({ eraStart: 1975 }, true, 1977), true);
  assert.equal(visibleInTimeline({ eraStart: 1977 }, true, 1977), true);
  assert.equal(visibleInTimeline({ eraStart: 1980 }, true, 1977), false);
});

test("unknown starts stay visible only when time filtering is off", () => {
  assert.equal(visibleInTimeline({}, true, 1977), false);
  assert.equal(visibleInTimeline({}, false, 1977), true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { connectionPath, nodeOffset, PLACE_PAGE_SIZE, visiblePlaceIndices } from "../site/src/globe/node-layout.mjs";

test("node offsets stay close to their geographic anchor", () => {
  const positions = Array.from({ length: PLACE_PAGE_SIZE }, (_, index) => nodeOffset(index));
  for (let i = 0; i < positions.length; i += 1) {
    assert.ok(Math.hypot(positions[i].x, positions[i].y) <= 26.1);
    for (let j = i + 1; j < positions.length; j += 1) {
      assert.ok(Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y) >= 22);
    }
  }
  assert.deepEqual(positions[0], { x: 0, y: 0 });
  for (let index = 8; index < 80; index += 1) {
    const offset = nodeOffset(index);
    assert.ok(Math.hypot(offset.x, offset.y) <= 38.1);
  }
});

test("dense locations page through nodes without sending them to other countries", () => {
  assert.deepEqual(visiblePlaceIndices(3), [0, 1, 2]);
  assert.deepEqual(visiblePlaceIndices(20, 0), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(visiblePlaceIndices(20, 1), [8, 9, 10, 11, 12, 13, 14, 15]);
  assert.deepEqual(visiblePlaceIndices(20, 2), [16, 17, 18, 19]);
  assert.equal(visiblePlaceIndices(20, 0, true).length, 20);
  assert.deepEqual(visiblePlaceIndices(20, 1, false, true), [0, 8, 9, 10, 11, 12, 13, 14]);
});

test("connection routes use only horizontal, vertical and 45-degree segments", () => {
  for (const [a, b] of [
    [{ x: 0, y: 0 }, { x: 80, y: 30 }],
    [{ x: 20, y: 50 }, { x: -30, y: -60 }],
    [{ x: 0, y: 0 }, { x: 0, y: 80 }],
    [{ x: 10, y: 10 }, { x: 60, y: 60 }],
  ]) {
    const points = [...connectionPath(a, b).matchAll(/[ML] (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)]
      .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
    assert.deepEqual(points[0], a);
    assert.deepEqual(points.at(-1), b);
    for (let i = 1; i < points.length; i += 1) {
      const dx = Math.abs(points[i].x - points[i - 1].x);
      const dy = Math.abs(points[i].y - points[i - 1].y);
      assert.ok(dx === 0 || dy === 0 || Math.abs(dx - dy) < 0.11);
    }
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { connectionPath, nodeOffset } from "../site/src/globe/node-layout.mjs";

test("node offsets keep coincident artists apart", () => {
  const positions = Array.from({ length: 64 }, (_, index) => nodeOffset(index));
  for (let i = 0; i < positions.length; i += 1) {
    assert.ok(Math.hypot(positions[i].x, positions[i].y) >= 33);
    for (let j = i + 1; j < positions.length; j += 1) {
      assert.ok(Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y) >= 23);
    }
  }
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

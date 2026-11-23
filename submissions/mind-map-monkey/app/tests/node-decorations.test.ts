import { describe, expect, test } from "bun:test";
import { centeredDecoration, DECOR_GLYPH, decorScaleFor, LINK_HANDLE_SIZE } from "../src/lib/node-decorations";

describe("node decorations", () => {
  test("hide only below the zoom-out threshold", () => {
    expect(decorScaleFor(0.2)).toBeNull();
    expect(decorScaleFor(0.349)).toBeNull();
    for (const zoom of [0.35, 0.5, 1, 1.5, 2, 2.5]) {
      expect(decorScaleFor(zoom)).not.toBeNull();
    }
  });

  test("keep controls usable and glyphs bounded throughout the zoom range", () => {
    for (let step = 35; step <= 250; step++) {
      const zoom = step / 100;
      const scale = decorScaleFor(zoom);
      expect(scale).not.toBeNull();
      if (scale === null) throw new Error("Decoration unexpectedly hidden");
      expect(LINK_HANDLE_SIZE * scale * zoom).toBeGreaterThanOrEqual(16);
      expect(DECOR_GLYPH * scale * zoom).toBeLessThanOrEqual(16);
    }
  });

  test("keeps the scaled container centered on its original anchor", () => {
    for (const scale of [0.45, 1, 2.1]) {
      const rect = centeredDecoration(30, -11, 38, 22, scale);
      expect(rect.x + rect.width / 2).toBeCloseTo(49);
      expect(rect.y + rect.height / 2).toBeCloseTo(0);
      expect(rect.width).toBeCloseTo(38 * scale);
      expect(rect.height).toBeCloseTo(22 * scale);
    }
  });
});

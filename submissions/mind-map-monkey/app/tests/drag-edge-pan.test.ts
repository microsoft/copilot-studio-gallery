import { describe, expect, test } from "bun:test";
import { dragDisplacement, edgePanVelocity } from "../src/lib/drag-edge-pan";

describe("edge panning", () => {
  const viewport = { left: 100, top: 50, width: 400, height: 300 };

  test("pans towards nearby edges, including when the pointer is outside", () => {
    expect(edgePanVelocity({ x: 300, y: 200 }, viewport)).toEqual({ x: 0, y: 0 });
    expect(edgePanVelocity({ x: 100, y: 350 }, viewport)).toEqual({ x: 600, y: -600 });
    expect(edgePanVelocity({ x: 520, y: 20 }, viewport)).toEqual({ x: -600, y: 600 });
    expect(edgePanVelocity({ x: 468, y: 200 }, viewport)).toEqual({ x: -300, y: 0 });
    expect(edgePanVelocity({ x: 150, y: 100 }, { left: 100, top: 50, width: 100, height: 100 })).toEqual({ x: 0, y: 0 });
  });

  test("keeps a drag under the pointer as the view pans or zooms", () => {
    const startView = { x: 100, y: 50, zoom: 2 };
    const point = { x: 200, y: 150 };
    expect(dragDisplacement(point, { x: 20, y: 10 }, startView, { x: 80, y: 60, zoom: 2 })).toEqual({ x: 20, y: 0 });
    expect(dragDisplacement(point, { x: 0, y: 0 }, startView, { x: 100, y: 50, zoom: 1 })).toEqual({ x: 50, y: 50 });
  });
});

interface Point {
  x: number;
  y: number;
}

interface View extends Point {
  zoom: number;
}

interface Viewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

const EDGE_ZONE = 64;
const MAX_SPEED = 600;

export function edgePanVelocity(pointer: Point, viewport: Viewport): Point {
  const axis = (position: number, start: number, size: number) => {
    const zone = Math.min(EDGE_ZONE, size / 2);
    if (zone <= 0) return 0;
    const local = position - start;
    if (local < zone) return MAX_SPEED * Math.min(1, (zone - local) / zone);
    if (local > size - zone) return -MAX_SPEED * Math.min(1, (local - (size - zone)) / zone);
    return 0;
  };
  return { x: axis(pointer.x, viewport.left, viewport.width), y: axis(pointer.y, viewport.top, viewport.height) };
}

export function dragDisplacement(startPoint: Point, delta: Point, startView: View, view: View): Point {
  return {
    x: (startPoint.x + delta.x - view.x) / view.zoom - (startPoint.x - startView.x) / startView.zoom,
    y: (startPoint.y + delta.y - view.y) / view.zoom - (startPoint.y - startView.y) / startView.zoom,
  };
}

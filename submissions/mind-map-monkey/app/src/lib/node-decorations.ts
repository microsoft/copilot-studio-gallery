export const LINK_HANDLE_SIZE = 22;
export const DECOR_GLYPH = 14;
const DECOR_MIN_PX = 16;
const DECOR_HIDE_ZOOM = 0.35;
const TOOLBAR_ICON_PX = 16;

export function decorScaleFor(zoom: number): number | null {
  if (zoom < DECOR_HIDE_ZOOM) return null;
  const grow = Math.ceil((DECOR_MIN_PX / (LINK_HANDLE_SIZE * zoom)) * 20) / 20;
  const shrink = Math.floor((TOOLBAR_ICON_PX / (DECOR_GLYPH * zoom)) * 20) / 20;
  return Math.max(grow, Math.min(1, shrink));
}

export function centeredDecoration(x: number, y: number, width: number, height: number, scale: number) {
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  return {
    x: x + (width - scaledWidth) / 2,
    y: y + (height - scaledHeight) / 2,
    width: scaledWidth,
    height: scaledHeight,
  };
}

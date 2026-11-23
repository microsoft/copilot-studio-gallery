import { useLayoutEffect, useRef } from "react";
import { registerTextMeasureContext } from "@/lib/text-measure";

/**
 * Hidden canvas whose 2D context measures node labels in the font they are drawn in (see `@/lib/text-measure`).
 * Mounted once by the shell, so the editor's canvas, the library's thumbnails and the PNG export size nodes alike.
 */
export function TextMeasurer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    registerTextMeasureContext(canvasRef.current?.getContext("2d") ?? null);
    return () => registerTextMeasureContext(null);
  }, []);
  // Never shown: it only measures.
  return <canvas ref={canvasRef} data-aether-canvas-purpose="non-drawing" aria-hidden="true" className="hidden" width={1} height={1} />;
}

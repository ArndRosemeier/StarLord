let cached: boolean | undefined;

/** Whether this browser can create a WebGL context at all. Checked once per page. */
export function webglAvailable(): boolean {
  if (cached !== undefined) return cached;
  try {
    if (typeof document === "undefined") return (cached = false);
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    cached = !!gl;
    (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}

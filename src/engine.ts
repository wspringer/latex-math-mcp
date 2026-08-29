/**
 * The typesetting engine: the `latex-math-wasi` browser module (a
 * `wasm32-unknown-unknown` cdylib with a three-function C ABI), bundled in
 * `engine/latex-math.wasm` and pinned in `engine.json`. No imports, no WASI,
 * no filesystem: everything goes in and out as bytes.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** A fill colour, in the shapes the engine's request schema takes. */
export type ColorSpec =
  | { gray: number }
  | { rgb: [number, number, number] }
  | { cmyk: [number, number, number, number] }
  | { spot: { name: string; tint?: number; cmyk: [number, number, number, number] } };

export type Format = "svg" | "pdf" | "png" | "metrics";

export interface EngineRequest {
  tex: string;
  format: Format;
  /** User units per em; PDF user units are points, SVG/PNG user units are pixels. */
  font_size?: number;
  style?: "display" | "text";
  padding?: number;
  /** PNG only: device pixels per user unit. */
  scale?: number;
  color?: ColorSpec;
  /** Named colours for `\color{name}{…}`. */
  palette?: Record<string, ColorSpec>;
  /** Font index per math level: display, text, script, scriptscript. */
  levels?: [number, number, number, number];
  scales?: [number, number, number, number];
}

/** What `format: "metrics"` returns: the document box and where the baseline is. */
export interface Metrics {
  width: number;
  height: number;
  /** Baseline to bottom edge — `vertical-align: -depth` places the image inline. */
  depth: number;
  ascent: number;
  em: number;
  /** x-height of the text font at this size, or null when the font has none. */
  ex: number | null;
}

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

interface Exports {
  memory: WebAssembly.Memory;
  latex_math_alloc(len: number): number;
  latex_math_free(ptr: number, len: number): void;
  latex_math_render(req: number, reqLen: number, blob: number, blobLen: number): bigint;
}

/** Package root: `dist/engine.js` → `..`; the same from `src/` under vitest. */
export function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export interface EnginePin {
  repository: string;
  version: string;
  revision: string;
  tag: string | null;
  file: string;
  sha256: string;
}

export async function readEnginePin(): Promise<EnginePin> {
  return JSON.parse(await readFile(path.join(packageRoot(), "engine.json"), "utf8"));
}

export class Engine {
  private constructor(
    private readonly exports: Exports,
    readonly pin: EnginePin,
  ) {}

  /** Loads the bundled module, verifying it against the pin's sha256. */
  static async load(): Promise<Engine> {
    const pin = await readEnginePin();
    const bytes = await readFile(path.join(packageRoot(), pin.file));
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (sha !== pin.sha256) {
      throw new EngineError(`${pin.file} does not match engine.json (sha256 ${sha})`);
    }
    const { instance } = await WebAssembly.instantiate(bytes, {});
    return new Engine(instance.exports as unknown as Exports, pin);
  }

  /**
   * Runs one request. `fonts` are the font files, in the order `levels`
   * indexes them; they are passed as one blob and the request carries their
   * lengths. Returns the output bytes (SVG/JSON text, or PDF/PNG binary).
   */
  render(request: EngineRequest, fonts: Uint8Array[]): Uint8Array {
    if (fonts.length === 0) throw new EngineError("at least one font is required");
    const blobLen = fonts.reduce((n, f) => n + f.length, 0);
    const blob = new Uint8Array(blobLen);
    let offset = 0;
    for (const f of fonts) {
      blob.set(f, offset);
      offset += f.length;
    }
    const req = new TextEncoder().encode(
      JSON.stringify({ ...request, fonts: fonts.map((f) => f.length) }),
    );

    const x = this.exports;
    // Views are taken after every alloc: growing the memory detaches old buffers.
    const reqPtr = x.latex_math_alloc(req.length);
    new Uint8Array(x.memory.buffer, reqPtr, req.length).set(req);
    const blobPtr = x.latex_math_alloc(blob.length);
    new Uint8Array(x.memory.buffer, blobPtr, blob.length).set(blob);
    const packed = x.latex_math_render(reqPtr, req.length, blobPtr, blob.length);
    const ptr = Number(packed >> 32n);
    const len = Number(packed & 0xffffffffn);
    const out = new Uint8Array(x.memory.buffer, ptr, len).slice();
    x.latex_math_free(ptr, len);
    x.latex_math_free(reqPtr, req.length);
    x.latex_math_free(blobPtr, blob.length);

    if (out.length === 0 || out[0] !== 0) {
      throw new EngineError(new TextDecoder().decode(out.subarray(1)));
    }
    return out.subarray(1);
  }

  /** `render` with `format: "metrics"`, parsed. */
  metrics(request: Omit<EngineRequest, "format">, fonts: Uint8Array[]): Metrics {
    const text = new TextDecoder().decode(this.render({ ...request, format: "metrics" }, fonts));
    return JSON.parse(text) as Metrics;
  }
}

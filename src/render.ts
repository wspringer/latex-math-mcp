/**
 * One formula → one file (PDF, SVG or PNG), its baseline metrics, and an
 * optional PNG preview. Units: the caller speaks pt, px or mm; the engine
 * works in the output document's own unit (PDF: points, SVG/PNG: pixels) and
 * the metrics are converted back.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ColorSpec, Engine, Metrics } from "./engine.js";
import type { FontCatalog } from "./fonts.js";

export const OUTPUT_FORMATS = ["pdf", "svg", "png"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
export const UNITS = ["pt", "px", "mm"] as const;
export type Unit = (typeof UNITS)[number];

/** Points per unit. */
const PT: Record<Unit, number> = { pt: 1, px: 0.75, mm: 72 / 25.4 };

export function convert(value: number, from: Unit, to: Unit): number {
  return (value * PT[from]) / PT[to];
}

/** The unit the output document itself is measured in. */
export function documentUnit(format: OutputFormat): Unit {
  return format === "pdf" ? "pt" : "px";
}

export interface RenderOptions {
  latex: string;
  format: OutputFormat;
  /** Where to write the output; parent directories are created. */
  outputPath: string;
  /** Em size, in `unit`. */
  fontSize: number;
  unit: Unit;
  display: boolean;
  /** Space around the formula, in `unit`. */
  padding: number;
  /** Font profile name; the catalog's default when omitted. */
  font?: string;
  color?: ColorSpec;
  palette?: Record<string, ColorSpec>;
  /** PNG only: device pixels per CSS pixel. */
  scale: number;
  /** Render a PNG preview (2 device pixels per px) and return its bytes. */
  preview: boolean;
}

export interface RenderResult {
  path: string;
  format: OutputFormat;
  font: string;
  unit: Unit;
  /** Box of the written document, in `unit`. */
  width: number;
  height: number;
  /** Baseline to bottom edge, in `unit`: place inline with `vertical-align: -depth`. */
  depth: number;
  ascent: number;
  em: number;
  ex: number | null;
  previewPng?: Uint8Array;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export async function renderMath(
  engine: Engine,
  catalog: FontCatalog,
  opts: RenderOptions,
): Promise<RenderResult> {
  const profile = catalog.resolve(opts.font);
  const fonts = await catalog.bytes(profile);
  const docUnit = documentUnit(opts.format);
  const base = {
    tex: opts.latex,
    font_size: convert(opts.fontSize, opts.unit, docUnit),
    style: opts.display ? ("display" as const) : ("text" as const),
    padding: convert(opts.padding, opts.unit, docUnit),
    color: opts.color,
    palette: opts.palette,
    levels: profile.levels,
  };

  const bytes = engine.render({ ...base, format: opts.format, scale: opts.scale }, fonts);
  const metrics: Metrics = engine.metrics(base, fonts);

  const outputPath = path.resolve(opts.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);

  let previewPng: Uint8Array | undefined;
  if (opts.preview) {
    // The preview is always sRGB: CMYK and spot colours have no PNG meaning,
    // so it is rendered with the document colour only when they are in play.
    const previewable = (c?: ColorSpec) => !c || "gray" in c || "rgb" in c;
    const paletteOk = Object.values(opts.palette ?? {}).every(previewable);
    previewPng = engine.render(
      {
        ...base,
        font_size: convert(opts.fontSize, opts.unit, "px"),
        padding: convert(opts.padding, opts.unit, "px"),
        format: "png",
        scale: 2,
        color: previewable(opts.color) ? opts.color : undefined,
        palette: paletteOk ? opts.palette : previewPalette(opts.palette),
      },
      fonts,
    );
  }

  const u = (v: number) => round(convert(v, docUnit, opts.unit));
  return {
    path: outputPath,
    format: opts.format,
    font: profile.name,
    unit: opts.unit,
    width: u(metrics.width),
    height: u(metrics.height),
    depth: u(metrics.depth),
    ascent: u(metrics.ascent),
    em: u(metrics.em),
    ex: metrics.ex === null ? null : u(metrics.ex),
    previewPng,
  };
}

/**
 * A preview stand-in for a print palette: spot colours show as their CMYK
 * alternate, CMYK as a naive sRGB conversion. Only for the inline PNG —
 * the output file keeps the real inks.
 */
function previewPalette(
  palette: Record<string, ColorSpec> | undefined,
): Record<string, ColorSpec> | undefined {
  if (!palette) return undefined;
  const out: Record<string, ColorSpec> = {};
  for (const [name, c] of Object.entries(palette)) {
    out[name] = toRgb(c);
  }
  return out;
}

export function toRgb(c: ColorSpec): ColorSpec {
  if ("gray" in c || "rgb" in c) return c;
  const [cy, m, y, k] = "cmyk" in c ? c.cmyk : c.spot.cmyk;
  const tint = "spot" in c ? (c.spot.tint ?? 1) : 1;
  const ch = (v: number) => round(1 - Math.min(1, v * tint + k * tint - v * k * tint * tint));
  return { rgb: [ch(cy), ch(m), ch(y)] };
}

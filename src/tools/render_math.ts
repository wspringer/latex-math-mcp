import path from "node:path";
import * as z from "zod/v4";
import type { Engine } from "../engine.js";
import type { FontCatalog } from "../fonts.js";
import { OUTPUT_FORMATS, renderMath, UNITS } from "../render.js";
import { colorSchema, toolResult } from "./_helpers.js";

export function makeRenderMathTool(engine: Engine, catalog: FontCatalog) {
  const inputSchema = z.object({
    latex: z.string().describe("LaTeX math (math mode only, no $ delimiters), e.g. \\frac{a}{b}"),
    format: z
      .enum(OUTPUT_FORMATS)
      .default("pdf")
      .describe(
        "pdf: real text with embedded, subsetted fonts and print colour — the one to place in " +
          "InDesign. svg: outlines as paths, sRGB. png: raster at `scale` device pixels per px.",
      ),
    name: z.string().default("formula").describe("Basename of the output file"),
    output_dir: z
      .string()
      .default("build")
      .describe("Directory the file is written to (created if missing), relative to the working directory"),
    unit: z
      .enum(UNITS)
      .default("pt")
      .describe("Unit of font_size, padding and the returned metrics. pt for print, px for web, mm for metric"),
    font_size: z.number().positive().default(12).describe("Em size in `unit`, e.g. 11 for 11 pt body text"),
    display: z
      .boolean()
      .default(true)
      .describe("Display style (like $$…$$: large operators, limits above/below) vs inline text style"),
    padding: z.number().min(0).default(0).describe("Space around the formula, in `unit`"),
    font: z
      .string()
      .optional()
      .describe("Font profile name (see list_fonts); the configured default when omitted"),
    color: colorSchema.optional().describe("Fill colour of the whole formula. PDF default: 100% K"),
    palette: z
      .record(z.string(), colorSchema)
      .optional()
      .describe(
        "Named colours for \\color{name}{…} inside the formula, e.g. {\"accent\": {\"spot\": …}}. " +
          "CSS colour names work without an entry.",
      ),
    scale: z.number().positive().default(2).describe("png only: device pixels per px"),
    preview: z
      .boolean()
      .default(true)
      .describe("Attach a PNG preview to the result so the typesetting is visible inline. Off for batch runs."),
  });

  const outputSchema = z.object({
    ok: z.boolean(),
    path: z.string().optional().describe("Absolute path of the written file"),
    format: z.enum(OUTPUT_FORMATS).optional(),
    font: z.string().optional(),
    unit: z.enum(UNITS).optional(),
    width: z.number().optional().describe("Document width, in `unit`"),
    height: z.number().optional().describe("Document height, in `unit`"),
    depth: z
      .number()
      .optional()
      .describe("Baseline to bottom edge, in `unit` — place the image inline with vertical-align: -depth"),
    ascent: z.number().optional().describe("Top edge to baseline, in `unit`"),
    em: z.number().optional(),
    ex: z.number().nullable().optional().describe("x-height of the text font at this size"),
    error: z.string().optional(),
  });

  return {
    name: "render_math",
    description:
      "Typeset a LaTeX math expression with OpenType MATH fonts into a placeable file. " +
      "PDF is the print path: embedded subsetted fonts, CMYK or spot-colour fill (a spot colour " +
      "becomes an InDesign swatch), optical-size cuts per math level when the font profile has them. " +
      "Returns width, height and depth (baseline offset) in the requested unit, so the file can " +
      "be aligned to surrounding text, plus a PNG preview.",
    inputSchema,
    outputSchema,
    handler: async (args: z.infer<typeof inputSchema>) => {
      try {
        const result = await renderMath(engine, catalog, {
          latex: args.latex,
          format: args.format,
          outputPath: path.join(args.output_dir, `${args.name}.${args.format}`),
          fontSize: args.font_size,
          unit: args.unit,
          display: args.display,
          padding: args.padding,
          font: args.font,
          color: args.color,
          palette: args.palette,
          scale: args.scale,
          preview: args.preview,
        });
        const { previewPng, ...rest } = result;
        return toolResult({ ok: true, ...rest }, { imagePng: previewPng });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return toolResult({ ok: false, error: message }, { isError: true });
      }
    },
  };
}

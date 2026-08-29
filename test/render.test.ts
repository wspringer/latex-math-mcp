import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Engine } from "../src/engine.js";
import { FontCatalog } from "../src/fonts.js";
import { convert, type RenderOptions, renderMath, toRgb } from "../src/render.js";
import { makeRenderMathTool } from "../src/tools/render_math.js";

let engine: Engine;
let catalog: FontCatalog;
let dir: string;

beforeAll(async () => {
  engine = await Engine.load();
  catalog = FontCatalog.builtin();
  dir = await mkdtemp(path.join(os.tmpdir(), "latex-math-mcp-"));
});

function opts(over: Partial<RenderOptions> = {}): RenderOptions {
  return {
    latex: "\\frac{a}{b}",
    format: "pdf",
    outputPath: path.join(dir, `${Math.random().toString(36).slice(2)}.pdf`),
    fontSize: 12,
    unit: "pt",
    display: true,
    padding: 0,
    scale: 2,
    preview: true,
    ...over,
  };
}

describe("renderMath", () => {
  it("writes a PDF and returns metrics in the requested unit", async () => {
    const r = await renderMath(engine, catalog, opts());
    expect((await readFile(r.path)).subarray(0, 5).toString()).toBe("%PDF-");
    expect(r.unit).toBe("pt");
    expect(r.em).toBe(12);
    expect(r.height).toBeCloseTo(r.ascent + r.depth, 2);
    expect(r.depth).toBeGreaterThan(0); // a fraction hangs below the baseline
    expect(r.previewPng?.subarray(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  it("converts units: mm in, mm out, points in the PDF", async () => {
    const pt = await renderMath(engine, catalog, opts({ fontSize: 12, unit: "pt", preview: false }));
    const mm = await renderMath(
      engine,
      catalog,
      opts({ fontSize: convert(12, "pt", "mm"), unit: "mm", preview: false }),
    );
    expect(mm.unit).toBe("mm");
    expect(convert(mm.width, "mm", "pt")).toBeCloseTo(pt.width, 2);
    expect(convert(mm.depth, "mm", "pt")).toBeCloseTo(pt.depth, 2);
    // Same bytes: the PDF is in points either way.
    expect(Buffer.compare(await readFile(pt.path), await readFile(mm.path))).toBe(0);
  });

  it("puts a spot colour and a palette into the PDF, and keeps the preview sRGB", async () => {
    const r = await renderMath(
      engine,
      catalog,
      opts({
        latex: "\\color{accent}{x} + y",
        color: { cmyk: [0, 0, 0, 1] },
        palette: { accent: { spot: { name: "PANTONE 300 C", cmyk: [1, 0.44, 0, 0] } } },
      }),
    );
    const pdf = (await readFile(r.path)).toString("latin1");
    expect(pdf).toContain("/Separation");
    expect(pdf).toContain("/PANTONE#20300#20C");
    expect(pdf).toContain("0 0 0 1 k");
    expect(r.previewPng).toBeDefined();
  });

  it("refuses print colours for SVG", async () => {
    await expect(
      renderMath(engine, catalog, opts({ format: "svg", color: { cmyk: [0, 0, 0, 1] } })),
    ).rejects.toThrow(/only possible with format "pdf"/);
  });

  it("phantom takes space but is not drawn", async () => {
    const a = await renderMath(engine, catalog, opts({ latex: "xy", format: "svg", preview: false }));
    const b = await renderMath(
      engine,
      catalog,
      opts({ latex: "\\phantom{x}y", format: "svg", preview: false }),
    );
    expect(b.width).toBeCloseTo(a.width, 3);
    const uses = (await readFile(b.path, "utf8")).split("\n").filter((l) => l.startsWith("<use"));
    expect(uses).toHaveLength(1);
  });

  it("toRgb approximates print colours for the preview", () => {
    expect(toRgb({ cmyk: [0, 0, 0, 1] })).toEqual({ rgb: [0, 0, 0] });
    expect(toRgb({ cmyk: [1, 0, 0, 0] })).toEqual({ rgb: [0, 1, 1] });
    expect(toRgb({ spot: { name: "x", tint: 0.5, cmyk: [0, 0, 0, 1] } })).toEqual({ rgb: [0.5, 0.5, 0.5] });
    expect(toRgb({ rgb: [1, 0, 0] })).toEqual({ rgb: [1, 0, 0] });
  });
});

describe("render_math tool", () => {
  it("returns JSON plus an image block, and errors as isError", async () => {
    const tool = makeRenderMathTool(engine, catalog);
    const ok = await tool.handler(
      tool.inputSchema.parse({ latex: "\\sqrt{2}", output_dir: dir, name: "root" }),
    );
    expect(ok.isError).toBe(false);
    expect(ok.content[0].type).toBe("text");
    expect(ok.content[1].type).toBe("image");
    const s = ok.structuredContent as { ok: boolean; path: string; depth: number; unit: string };
    expect(s.ok).toBe(true);
    expect(s.path).toBe(path.join(dir, "root.pdf"));
    expect(s.unit).toBe("pt");

    const bad = await tool.handler(tool.inputSchema.parse({ latex: "\\frac{a}", output_dir: dir }));
    expect(bad.isError).toBe(true);
    expect((bad.structuredContent as { error: string }).error).toMatch(/Parse/);
  });
});

import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Engine, EngineError, packageRoot } from "../src/engine.js";

let engine: Engine;
let stix: Uint8Array;

beforeAll(async () => {
  engine = await Engine.load();
  stix = new Uint8Array(await readFile(path.join(packageRoot(), "fonts", "STIXTwoMath-Regular.otf")));
});

describe("engine", () => {
  it("renders SVG, PDF and PNG from the bundled module", () => {
    const svg = new TextDecoder().decode(engine.render({ tex: "x^2", format: "svg" }, [stix]));
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toContain("vertical-align:");
    const pdf = engine.render({ tex: "x^2", format: "pdf" }, [stix]);
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
    const png = engine.render({ tex: "x^2", format: "png", scale: 2 }, [stix]);
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("returns metrics that agree with the SVG header", () => {
    const m = engine.metrics({ tex: "\\frac{a}{b}", padding: 2 }, [stix]);
    const svg = new TextDecoder().decode(
      engine.render({ tex: "\\frac{a}{b}", format: "svg", padding: 2 }, [stix]),
    );
    const depth = Number(/vertical-align:-([0-9.]+)px/.exec(svg)![1]);
    expect(Math.abs(depth - m.depth)).toBeLessThan(0.001);
    expect(m.height).toBeCloseTo(m.ascent + m.depth, 6);
    expect(m.em).toBe(16);
    expect(m.ex).not.toBeNull();
  });

  it("is deterministic", () => {
    const a = engine.render({ tex: "\\sqrt{2}", format: "pdf" }, [stix]);
    const b = engine.render({ tex: "\\sqrt{2}", format: "pdf" }, [stix]);
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
  });

  it("surfaces engine errors", () => {
    expect(() => engine.render({ tex: "\\frac{a}", format: "svg" }, [stix])).toThrow(EngineError);
    expect(() => engine.render({ tex: "x", format: "svg" }, [])).toThrow(EngineError);
  });
});

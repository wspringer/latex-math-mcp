import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FontCatalog, resolveProfile } from "../src/fonts.js";

describe("font profiles", () => {
  it("a single file serves every level", () => {
    const p = resolveProfile("one", "Math.otf", "/base");
    expect(p.files).toEqual(["/base/Math.otf"]);
    expect(p.levels).toEqual([0, 0, 0, 0]);
  });

  it("optical cuts map to levels and fall back sensibly", () => {
    const p = resolveProfile(
      "minion",
      {
        display: "MinionMath-Subh.otf",
        text: "MinionMath-Regular.otf",
        script: "MinionMath-Capt.otf",
        scriptscript: "MinionMath-Tiny.otf",
      },
      "/f",
    );
    expect(p.files).toEqual([
      "/f/MinionMath-Subh.otf",
      "/f/MinionMath-Regular.otf",
      "/f/MinionMath-Capt.otf",
      "/f/MinionMath-Tiny.otf",
    ]);
    expect(p.levels).toEqual([0, 1, 2, 3]);

    // text + script only: display uses text, scriptscript uses script.
    const q = resolveProfile("two", { text: "R.otf", script: "C.otf" }, "/f");
    expect(q.files).toEqual(["/f/R.otf", "/f/C.otf"]);
    expect(q.levels).toEqual([0, 0, 1, 1]);
    expect(() => resolveProfile("bad", { script: "C.otf" }, "/f")).toThrow(/needs at least/);
  });

  it("reads a config file, keeps the bundled font, resolves relative to the file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "latex-math-mcp-"));
    const file = path.join(dir, "fonts.json");
    await writeFile(
      file,
      JSON.stringify({
        default: "minion",
        fonts: { minion: { text: "cuts/MinionMath-Regular.otf" }, plain: "~/Fonts/X.otf" },
      }),
    );
    const c = await FontCatalog.fromConfig(file);
    expect(c.defaultName).toBe("minion");
    expect(c.resolve().files).toEqual([path.join(dir, "cuts", "MinionMath-Regular.otf")]);
    expect(c.resolve("plain").files).toEqual([path.join(os.homedir(), "Fonts", "X.otf")]);
    expect(c.resolve("stix2").bundled).toBe(true);
    expect(() => c.resolve("nope")).toThrow(/unknown font "nope"; known: /);
    expect(await c.check(c.resolve("minion"))).toEqual({
      [path.join(dir, "cuts", "MinionMath-Regular.otf")]: false,
    });
    await expect(c.bytes(c.resolve("minion"))).rejects.toThrow(/cannot read/);
  });

  it("rejects a default that is not defined", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "latex-math-mcp-"));
    const file = path.join(dir, "fonts.json");
    await writeFile(file, JSON.stringify({ default: "ghost" }));
    await expect(FontCatalog.fromConfig(file)).rejects.toThrow(/"ghost" is not defined/);
  });
});

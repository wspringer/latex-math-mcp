import * as z from "zod/v4";
import type { Engine } from "../engine.js";
import { type FontCatalog, LEVELS } from "../fonts.js";
import { toolResult } from "./_helpers.js";

export function makeListFontsTool(engine: Engine, catalog: FontCatalog) {
  const inputSchema = z.object({});
  const outputSchema = z.object({
    default: z.string(),
    config: z.string().nullable().describe("The profiles file in use, or null for the bundled font only"),
    fonts: z.array(
      z.object({
        name: z.string(),
        bundled: z.boolean(),
        cuts: z.record(z.enum(LEVELS), z.string()).describe("Font file per math level"),
        missing: z.array(z.string()).describe("Files that do not exist on disk"),
      }),
    ),
    engine: z.object({ version: z.string(), revision: z.string() }),
  });

  return {
    name: "list_fonts",
    description:
      "List the font profiles render_math can use: the bundled STIX Two Math and whatever the " +
      "server was configured with (e.g. Minion Math with Subhead/Regular/Caption/Tiny cuts per level).",
    inputSchema,
    outputSchema,
    handler: async () => {
      const fonts = [];
      for (const p of catalog.profiles.values()) {
        const exists = await catalog.check(p);
        fonts.push({
          name: p.name,
          bundled: p.bundled,
          cuts: p.cuts,
          missing: Object.entries(exists)
            .filter(([, ok]) => !ok)
            .map(([f]) => f),
        });
      }
      return toolResult({
        default: catalog.defaultName,
        config: catalog.configPath,
        fonts,
        engine: { version: engine.pin.version, revision: engine.pin.revision },
      });
    },
  };
}

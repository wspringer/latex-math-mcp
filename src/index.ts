#!/usr/bin/env node
/**
 * latex-math-mcp: LaTeX math → PDF / SVG / PNG with OpenType MATH fonts.
 *
 * Font profiles come from a JSON file named by `--fonts <path>` or the
 * `LATEX_MATH_FONTS` environment variable; without either, only the bundled
 * STIX Two Math is available.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { Engine } from "./engine.js";
import { FontCatalog } from "./fonts.js";
import { makeListFontsTool } from "./tools/list_fonts.js";
import { makeRenderMathTool } from "./tools/render_math.js";

function fontsConfigPath(argv: string[]): string | undefined {
  const i = argv.indexOf("--fonts");
  if (i >= 0) {
    const p = argv[i + 1];
    if (!p) throw new Error("--fonts needs a path");
    return p;
  }
  const env = process.env.LATEX_MATH_FONTS;
  return env && env.trim() !== "" ? env : undefined;
}

async function main() {
  const configPath = fontsConfigPath(process.argv.slice(2));
  const [engine, catalog] = await Promise.all([
    Engine.load(),
    configPath ? FontCatalog.fromConfig(configPath) : Promise.resolve(FontCatalog.builtin()),
  ]);

  const server = new McpServer({ name: "latex-math-mcp", version: "0.0.0" });
  for (const tool of [makeRenderMathTool(engine, catalog), makeListFontsTool(engine, catalog)]) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      },
      (args: unknown) => tool.handler(tool.inputSchema.parse(args) as never),
    );
  }
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

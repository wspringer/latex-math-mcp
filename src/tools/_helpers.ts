import * as z from "zod/v4";

/** A fill colour, as the engine takes it. Components are 0–1. */
export const colorSchema = z
  .union([
    z.object({ gray: z.number().min(0).max(1) }),
    z.object({ rgb: z.tuple([z.number(), z.number(), z.number()]) }),
    z.object({ cmyk: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
    z.object({
      spot: z.object({
        name: z.string().min(1).describe("Colorant name as the printer / InDesign swatch knows it"),
        tint: z.number().min(0).max(1).optional().describe("0–1, default 1"),
        cmyk: z
          .tuple([z.number(), z.number(), z.number(), z.number()])
          .describe("CMYK alternate, for devices without the colorant"),
      }),
    }),
  ])
  .describe(
    '{"gray": k} | {"rgb": [r,g,b]} | {"cmyk": [c,m,y,k]} | {"spot": {"name", "tint", "cmyk"}}, ' +
      "components 0–1. PDF takes all four; SVG/PNG only gray and rgb.",
  );

interface ToolResultOptions {
  isError?: boolean;
  /**
   * PNG bytes to attach as an `image` content block next to the JSON, so the
   * model sees what it typeset without reading a file — and a client without
   * filesystem access can see it at all.
   */
  imagePng?: Uint8Array;
}

/** Wrap a structured result in the shape MCP tool handlers must return. */
export function toolResult<T extends object>(result: T, opts: ToolResultOptions = {}) {
  const content: Array<
    { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
  > = [{ type: "text", text: JSON.stringify(result, null, 2) }];
  if (opts.imagePng) {
    content.push({
      type: "image",
      data: Buffer.from(opts.imagePng).toString("base64"),
      mimeType: "image/png",
    });
  }
  return {
    content,
    structuredContent: { ...result },
    isError: opts.isError ?? false,
  };
}

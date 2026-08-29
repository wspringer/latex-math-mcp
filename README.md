# latex-math-mcp

MCP server that typesets LaTeX math with real OpenType MATH fonts into placeable
assets: **PDF** with embedded, subsetted fonts and print colour (CMYK or a spot colour
that InDesign shows as a swatch), plus SVG and PNG — and returns the baseline metrics
the model needs to align the result with surrounding text.

Nothing to install beyond Node: the engine is a WebAssembly build of
[latex-math-wasi](https://github.com/wspringer/latex-math-wasi), bundled in the package.
STIX Two Math (OFL) is bundled as the default font; your own MATH fonts — including
optical-size families like Minion Math — are one JSON file away.

## Quick start

Claude Code — `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "latex-math": {
      "command": "npx",
      "args": ["-y", "latex-math-mcp@latest"]
    }
  }
}
```

Claude Desktop — `claude_desktop_config.json`, same entry under `mcpServers`.

## Tools

- **`render_math`** — typeset a LaTeX math expression. Defaults to PDF in points with
  a 12 pt em, 100 % K fill. Takes `format` (`pdf`/`svg`/`png`), `unit` (`pt`/`px`/`mm`),
  `font_size`, `display`, `padding`, `font` (a profile name), `color`, `palette`,
  `output_dir`/`name`, `scale` (PNG density) and `preview`. Returns the file path and
  `width`, `height`, `depth`, `ascent`, `em`, `ex` in the requested unit — `depth` is
  the distance from the baseline to the bottom edge, so an inline image sits right with
  `vertical-align: -depth` — and attaches a PNG preview so the model sees what it set.
- **`list_fonts`** — the font profiles available, which files they map to per math
  level, and which are missing on disk.

Colour, the reason to prefer PDF over SVG for print:

```json
{ "color": { "cmyk": [0, 0, 0, 1] } }
{ "color": { "spot": { "name": "PANTONE 300 C", "tint": 1, "cmyk": [1, 0.44, 0, 0] } } }
```

and inside a formula, `\color{accent}{…}` with

```json
{ "palette": { "accent": { "spot": { "name": "PANTONE 300 C", "cmyk": [1, 0.44, 0, 0] } } } }
```

CSS colour names (`\color{red}`, `\blue{…}`) work without a palette entry; `\phantom`
takes space without drawing. SVG and PNG are sRGB: they accept `gray` and `rgb` and
refuse `cmyk`/`spot` rather than converting silently.

## Fonts

Point the server at a profiles file with `--fonts <path>` or `LATEX_MATH_FONTS`:

```json
{
  "mcpServers": {
    "latex-math": {
      "command": "npx",
      "args": ["-y", "latex-math-mcp@latest", "--fonts", "/Users/me/Fonts/math-profiles.json"]
    }
  }
}
```

```json
{
  "default": "minion",
  "fonts": {
    "minion": {
      "display": "MinionMath/MinionMath-Subh.otf",
      "text": "MinionMath/MinionMath-Regular.otf",
      "script": "MinionMath/MinionMath-Capt.otf",
      "scriptscript": "MinionMath/MinionMath-Tiny.otf"
    },
    "garamond": "Garamond-Math.otf"
  }
}
```

A string is one font for every math level; an object names a cut per level (missing
levels fall back: display → text, script → text, scriptscript → script). Paths are
relative to the profiles file; `~/` works. Each level reads its MATH constants from its
own cut and the script levels are still scaled by the text font's
`ScriptPercentScaleDown`, so optical sizes behave as the designer intended. `stix2`
is always present. Font files never leave your machine: only subsetted glyphs end up
in the PDF, which is what every font licence allows for documents.

## What you get

`\color{accent}{\sum_{i=1}^{n}} \frac{x_i^2}{\sqrt{1+e^{-x_i}}}` as an 11 pt display
formula comes back as a PDF whose sum sign is a PANTONE 300 C separation, with
`{"width": 61.249, "height": 29.759, "depth": 12.353, "ascent": 17.406, "em": 11, "ex": 5.203}`
in points, and a preview PNG in the tool result.

## Licence

MIT. The bundled engine is MIT (latex-math-wasi, with layout code from
[ReX](https://github.com/KenyC/ReX), MIT). STIX Two Math is under the SIL Open Font
License 1.1 (`fonts/OFL-STIXTwoMath.txt`).

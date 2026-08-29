# latex-math-mcp

MCP server that typesets LaTeX math into placeable PDF (print colour), SVG
and PNG with a WebAssembly build of
[latex-math-wasi](https://github.com/wspringer/latex-math-wasi), bundled in
`engine/latex-math.wasm` and pinned in `engine.json`. Sibling of
`lilypond-mcp`; same conventions. See `README.md` for the user-facing story.

## Working practices

- **Feature branches + PRs, never direct pushes to `main`** once branch
  protection is on; the `test` check is required.
- **Document every user-facing change with a change file**
  (`.changeset/<slug>.md`, Knope changesets):

  ```markdown
  ---
  default: minor
  ---

  #### One-line summary for the changelog

  Optional detail, written for npm users.
  ```

  Change files are the **only** source of release semantics
  (`ignore_conventional_commits = true`); commit subjects never bump
  versions. PRs that change nothing for npm users get the
  `not user facing` label.
- **Releases:** the Knope bot keeps a release PR open; merging it tags and
  `release.yml` publishes to npm via trusted publishing. Never
  `npm publish` by hand.
- **Engine updates:** `node scripts/update-engine.mjs <tag>` pulls a
  latex-math-wasi release (or `--local ../latex-math-wasi` builds a
  checkout); commit `engine/`, `engine.json` and a change file together.
  `Engine.load()` refuses a module whose sha256 differs from the pin.

## Design points worth knowing

- The engine has no imports: `WebAssembly.instantiate(bytes, {})`, three
  exports (`latex_math_alloc/render/free`), request JSON + font blob in,
  bytes out. No `node:wasi`, no worker, no preopens. Views into
  `memory.buffer` are taken after every alloc (growth detaches buffers).
- Units: the caller speaks pt/px/mm; the engine works in the document's
  unit (PDF pt, SVG/PNG px) and `src/render.ts` converts both ways. A PDF
  is always in points regardless of `unit`.
- Colour: PDF takes gray/rgb/cmyk/spot; SVG/PNG only gray/rgb and the
  engine refuses the rest rather than converting. The inline preview is
  the one place print colours are approximated (`toRgb`), never the file.
- Fonts never leave the machine and are never in this repo except the OFL
  STIX Two Math in `fonts/`. Commercial fonts (Minion Math) are configured
  by path in the user's profiles file.

## Tests

`npm run build && npm test` — vitest, all offline against the bundled
engine and font.

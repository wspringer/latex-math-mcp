# Changelog

All notable changes to this project will be documented in this file.
## 0.1.0 (2026-09-01)

### Breaking Changes

#### First release

`render_math` typesets LaTeX math with OpenType MATH fonts into PDF (embedded subsetted
fonts, CMYK / spot-colour fill, `\color{name}` through a palette), SVG or PNG, and returns
width, height and depth so the file can be aligned to surrounding text. `list_fonts` shows
the configured font profiles; STIX Two Math is bundled, optical-size cuts per math level
are one JSON file away.

### Features

#### Engine updated to v0.1.1

The bundled WebAssembly engine now tracks
[latex-math-wasi v0.1.1](https://github.com/wspringer/latex-math-wasi/releases/tag/v0.1.1).

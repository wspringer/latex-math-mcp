---
default: minor
---

#### First release

`render_math` typesets LaTeX math with OpenType MATH fonts into PDF (embedded subsetted
fonts, CMYK / spot-colour fill, `\color{name}` through a palette), SVG or PNG, and returns
width, height and depth so the file can be aligned to surrounding text. `list_fonts` shows
the configured font profiles; STIX Two Math is bundled, optical-size cuts per math level
are one JSON file away.

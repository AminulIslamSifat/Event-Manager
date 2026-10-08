# one default svg thumb per category, generated at startup.
# no binary assets, stays crisp at any size. used when an event has no uploaded image.

from pathlib import Path

# category -> (base, accent)
PALETTE = {
    "Tech":      ("#1b2a4a", "#5b8dd6"),
    "Music":     ("#3a1f3d", "#c07ad6"),
    "Art":       ("#3d2a1f", "#d69a5b"),
    "Sports":    ("#1f3d2a", "#5bd68a"),
    "Food":      ("#3d1f22", "#d65b6a"),
    "Education": ("#1f343d", "#5bb8d6"),
    "General":   ("#2a2a2e", "#c9a94e"),
}

# glyph per category, 100x100 box
GLYPHS = {
    "Tech": (
        '<rect x="24" y="32" width="52" height="34" rx="4" fill="none" '
        'stroke="{a}" stroke-width="3"/>'
        '<path d="M40 74h20" stroke="{a}" stroke-width="3" stroke-linecap="round"/>'
        '<path d="M50 66v8" stroke="{a}" stroke-width="3"/>'
        '<path d="M36 46l-6 6 6 6M64 46l6 6-6 6" stroke="{a}" stroke-width="3" '
        'fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    "Music": (
        '<circle cx="38" cy="66" r="8" fill="none" stroke="{a}" stroke-width="3"/>'
        '<circle cx="62" cy="60" r="8" fill="none" stroke="{a}" stroke-width="3"/>'
        '<path d="M46 66V36l24-6v30" stroke="{a}" stroke-width="3" fill="none" '
        'stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    "Art": (
        '<path d="M50 26c-14 0-24 10-24 22 0 10 7 14 7 20 0 4-3 6-3 6h40s-3-2-3-6c0-6 7-10 '
        '7-20 0-12-10-22-24-22z" fill="none" stroke="{a}" stroke-width="3" '
        'stroke-linejoin="round"/>'
        '<circle cx="42" cy="46" r="3.5" fill="{a}"/>'
        '<circle cx="58" cy="42" r="3.5" fill="{a}"/>'
    ),
    "Sports": (
        '<circle cx="50" cy="50" r="22" fill="none" stroke="{a}" stroke-width="3"/>'
        '<path d="M50 28v44M28 50h44" stroke="{a}" stroke-width="3"/>'
        '<path d="M34 34l32 32M66 34L34 66" stroke="{a}" stroke-width="2" opacity="0.5"/>'
    ),
    "Food": (
        '<path d="M30 40h40v8a20 20 0 01-40 0z" fill="none" stroke="{a}" stroke-width="3" '
        'stroke-linejoin="round"/>'
        '<path d="M26 40h48" stroke="{a}" stroke-width="3" stroke-linecap="round"/>'
        '<path d="M42 30v-8M58 30v-8" stroke="{a}" stroke-width="3" stroke-linecap="round"/>'
    ),
    "Education": (
        '<path d="M50 30L26 42l24 12 24-12z" fill="none" stroke="{a}" stroke-width="3" '
        'stroke-linejoin="round"/>'
        '<path d="M34 48v14c0 4 8 8 16 8s16-4 16-8V48" fill="none" stroke="{a}" '
        'stroke-width="3" stroke-linecap="round"/>'
    ),
    "General": (
        '<rect x="28" y="34" width="44" height="34" rx="5" fill="none" '
        'stroke="{a}" stroke-width="3"/>'
        '<path d="M28 46h44" stroke="{a}" stroke-width="3"/>'
        '<circle cx="36" cy="40" r="2" fill="{a}"/>'
    ),
}


def _svg(category: str) -> str:
    base, accent = PALETTE.get(category, PALETTE["General"])
    glyph = GLYPHS.get(category, GLYPHS["General"]).format(a=accent)

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="600" height="600" role="img" aria-label="{category} event">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{base}"/>
      <stop offset="100%" stop-color="#0d0d0f"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="{accent}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="{accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100" height="100" fill="url(#bg)"/>
  <rect width="100" height="100" fill="url(#glow)"/>
  {glyph}
</svg>
'''


def write_thumbnails(static_folder: str) -> int:
    # one svg per category into static/thumbs, returns how many
    target = Path(static_folder) / "thumbs"
    target.mkdir(parents=True, exist_ok=True)

    written = 0
    for category in PALETTE:
        path = target / f"{category.lower()}.svg"
        svg = _svg(category)
        # only write if it actually changed, keeps restarts quiet
        if not path.exists() or path.read_text(encoding="utf-8") != svg:
            path.write_text(svg, encoding="utf-8")
            written += 1
    return written


def thumbnail_url(category: str | None) -> str:
    # public url for a category's default thumb
    key = (category or "General").strip().title()
    if key not in PALETTE:
        key = "General"
    return f"/static/thumbs/{key.lower()}.svg"

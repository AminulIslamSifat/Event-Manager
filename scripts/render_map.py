#!/usr/bin/env python3
"""Render a high-res map centered on a coord by stitching map tiles.

Usage:
    uv run --with pillow --with httpx render_map.py
    uv run --with pillow --with httpx render_map.py --lat 23.78 --lon 90.42 --zoom 18 --grid 7 --size 4096 --source esri
"""
from __future__ import annotations

import argparse
import io
import math
from pathlib import Path

import httpx
from PIL import Image

TILE = 256

SOURCES = {
    # name: (url template, attribution)
    "google-road": ("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", "© Google"),
    "google-hybrid": ("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", "© Google"),
    "google-sat": ("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", "© Google"),
    "google-terrain": ("https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}", "© Google"),
    "osm": ("https://tile.openstreetmap.org/{z}/{x}/{y}.png", "© OpenStreetMap contributors"),
    "esri": (
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        "© Esri, Maxar, Earthstar Geographics",
    ),
    "carto": (
        "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "© OpenStreetMap contributors © CARTO",
    ),
}


def deg2tile(lat: float, lon: float, z: int) -> tuple[float, float]:
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
    return x, y


def fetch_tile(url: str, client: httpx.Client) -> Image.Image:
    r = client.get(url)
    r.raise_for_status()
    return Image.open(io.BytesIO(r.content)).convert("RGB")


def render(lat: float, lon: float, zoom: int, grid: int, size: int, source: str, out: Path, marker: bool = True) -> Path:
    template, attribution = SOURCES[source]

    # the stitched canvas MUST be at least as large as the requested crop,
    # otherwise PIL pads the overflow with black
    needed = math.ceil(size / TILE) + 1
    if needed % 2 == 0:
        needed += 1
    if grid < needed:
        print(f"  grid {grid} too small for {size}px output -> auto-bumping to {needed}")
        grid = needed

    xf, yf = deg2tile(lat, lon, zoom)
    xc, yc = int(xf), int(yf)
    half = grid // 2

    canvas = Image.new("RGB", (grid * TILE, grid * TILE))
    headers = {"User-Agent": "event-khujo-map-render/1.0 (https://github.com/sifat)"}

    total = grid * grid
    done = 0
    with httpx.Client(headers=headers, timeout=30.0, follow_redirects=True) as client:
        for dy in range(-half, half + 1):
            for dx in range(-half, half + 1):
                url = template.format(z=zoom, x=xc + dx, y=yc + dy)
                try:
                    img = fetch_tile(url, client)
                except Exception as e:
                    print(f"  ! tile {xc+dx},{yc+dy} failed: {e}")
                    img = Image.new("RGB", (TILE, TILE), (30, 30, 30))
                canvas.paste(img, ((dx + half) * TILE, (dy + half) * TILE))
                done += 1
                print(f"\r  tiles {done}/{total}", end="", flush=True)
    print()

    # exact coords at image center
    px = (xf - (xc - half)) * TILE
    py = (yf - (yc - half)) * TILE
    left = int(round(px - size / 2))
    top = int(round(py - size / 2))

    cropped = canvas.crop((left, top, left + size, top + size))

    if marker:
        from PIL import ImageDraw
        d = ImageDraw.Draw(cropped)
        cx = cy = size // 2
        r = max(2, size // 500)          # plain tiny dot
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(220, 30, 30))

    out.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(out)
    print(f"saved {out}  ({size}x{size})  source={source} zoom={zoom}")
    print(f"attribution: {attribution}")
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--lat", type=float, default=23.788185)
    p.add_argument("--lon", type=float, default=90.427947)
    p.add_argument("--zoom", type=int, default=18)
    p.add_argument("--grid", type=int, default=7, help="tiles per side (odd number)")
    p.add_argument("--size", type=int, default=4096, help="output px per side")
    p.add_argument("--source", choices=list(SOURCES), default="google-road")
    p.add_argument("--out", type=Path, default=None)
    p.add_argument("--no-marker", action="store_true", help="skip the center pin")
    a = p.parse_args()

    out = a.out or Path(f"/home/sifat/sable_output/assets/map_{a.lat:.5f}_{a.lon:.5f}_{a.source}_{a.zoom}.png")
    render(a.lat, a.lon, a.zoom, a.grid, a.size, a.source, out, marker=not a.no_marker)


if __name__ == "__main__":
    main()

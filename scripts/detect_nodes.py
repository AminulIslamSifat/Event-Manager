#!/usr/bin/env python3
"""Auto-detect labeled checkpoint circles on the traced map and convert to lat/lon."""
from __future__ import annotations

import math
from pathlib import Path

import cv2
import numpy as np

SRC = Path("/home/sifat/Pictures/map.png")
OUT = Path("/tmp/detected.png")

# map render params
CENTER_LAT = 23.788185
CENTER_LON = 90.427947
ZOOM = 19
SIZE = 1024
TILE = 256


def deg2tile(lat: float, lon: float, z: int) -> tuple[float, float]:
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
    return x, y


def tile2deg(x: float, y: float, z: int) -> tuple[float, float]:
    n = 2 ** z
    lon = x / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lat, lon


def px2latlon(px: float, py: float) -> tuple[float, float]:
    xf, yf = deg2tile(CENTER_LAT, CENTER_LON, ZOOM)
    half = SIZE / 2
    xn = xf + (px - half) / TILE
    yn = yf + (py - half) / TILE
    return tile2deg(xn, yn, ZOOM)


def main() -> None:
    img = cv2.imread(str(SRC))
    b, g, r = cv2.split(img)
    ri, gi, bi = r.astype(int), g.astype(int), b.astype(int)
    red = ((ri - gi > 60) & (ri - bi > 60) & (ri > 110)).astype(np.uint8) * 255

    circles = cv2.HoughCircles(
        red, cv2.HOUGH_GRADIENT, dp=1, minDist=28,
        param1=80, param2=14, minRadius=13, maxRadius=24,
    )

    vis = img.copy()
    kept = []
    if circles is not None:
        for cx, cy, rad in np.round(circles[0]).astype(int):
            # his circles: white interior w/ red letter. google pins: solid red interior.
            inner = red[max(0, cy - int(rad * 0.55)):cy + int(rad * 0.55),
                        max(0, cx - int(rad * 0.55)):cx + int(rad * 0.55)]
            inner_red = inner.mean() / 255 if inner.size else 1.0
            if inner_red > 0.45:
                continue  # solid red = google POI pin, skip
            kept.append((cx, cy, rad))

    kept.sort(key=lambda c: (c[1] // 60, c[0]))
    for i, (cx, cy, rad) in enumerate(kept):
        lat, lon = px2latlon(cx, cy)
        print(f"#{i+1:2d}  px=({cx:4d},{cy:4d})  r={rad:2d}  ->  {lat:.6f}, {lon:.6f}")
        cv2.circle(vis, (cx, cy), rad, (0, 255, 0), 2)
        cv2.putText(vis, str(i + 1), (cx - 8, cy - rad - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 140, 0), 2)

    print(f"\ntotal detected: {len(kept)}")
    cv2.imwrite(str(OUT), vis)
    print(f"overlay -> {OUT}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Stamp labeled checkpoint circles onto a rendered map."""
from __future__ import annotations

import glob
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SRC = Path("/home/sifat/sable_output/assets/map_23.78818_90.42795_google-road_19.png")
OUT = Path("/home/sifat/sable_output/assets/map_marked_19.png")

# (x, y, label, name)  -- pixel coords on the 1024x1024 render
NODES = [
    (320, 640, "A", "Thana Rd (west)"),
    (533, 578, "B", "Thana Rd x Kazi Nazrul Islam Rd"),
    (600, 558, "C", "Thana Rd x Hazipara Masjid Rd"),
    (700, 525, "D", "Hazipara Masjid Rd (mid)"),
    (950, 550, "E", "Hazipara Masjid Rd x Hazipara Main Rd"),
    (533, 240, "F", "Kazi Nazrul Islam Rd (north)"),
    (512, 512, "G", "YOUR HOUSE"),
    (700, 655, "H", "Akota Abashik junction"),
    (445, 925, "I", "Shorif Jahan junction"),
    (985, 690, "J", "Hazipara Main Rd (south)"),
]

R = 18


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for pat in (
        "/usr/share/fonts/**/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/**/LiberationSans-Bold.ttf",
        "/usr/share/fonts/**/*Bold.ttf",
    ):
        hits = glob.glob(pat, recursive=True)
        if hits:
            return ImageFont.truetype(hits[0], size)
    return ImageFont.load_default()


def main() -> None:
    im = Image.open(SRC).convert("RGB")
    d = ImageDraw.Draw(im)
    font = load_font(24)

    for x, y, label, _name in NODES:
        is_house = label == "G"
        fill = (200, 0, 0) if is_house else (255, 255, 255)
        ring = (255, 255, 255) if is_house else (200, 0, 0)
        txt = (255, 255, 255) if is_house else (200, 0, 0)

        d.ellipse((x - R, y - R, x + R, y + R), fill=fill, outline=ring, width=3)
        bb = d.textbbox((0, 0), label, font=font)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        d.text((x - tw / 2 - bb[0], y - th / 2 - bb[1]), label, fill=txt, font=font)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT)
    print(f"saved {OUT}")
    for _x, _y, label, name in NODES:
        print(f"  {label}: {name}")


if __name__ == "__main__":
    main()

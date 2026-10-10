#!/usr/bin/env python3
"""Cuts the generated planets out of their dark backgrounds.

The image model paints planets on near-black, but not always pure black, so each
picture gets a feathered circular alpha mask fitted to the planet's disc (found by
comparing pixels with the corner colour). Run after scripts/gen-assets.mjs:

    python3 scripts/planet-alpha.py public/planets/*.webp
"""
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

for path in sys.argv[1:]:
    im = Image.open(path).convert("RGB")
    w, h = im.size
    corners = [im.getpixel(p) for p in [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)]]
    bg = tuple(sorted(c[i] for c in corners)[1] for i in range(3))
    diff = ImageChops.difference(im, Image.new("RGB", im.size, bg)).convert("L")
    box = diff.point(lambda v: 255 if v > 28 else 0).getbbox()
    if not box:
        continue
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    r = max(box[2] - box[0], box[3] - box[1]) / 2 + w * 0.01
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(w * 0.008))
    out = im.convert("RGBA")
    out.putalpha(mask)
    # Crop to the disc so every planet fills its frame the same way.
    pad = int(w * 0.02)
    out = out.crop((max(0, int(cx - r) - pad), max(0, int(cy - r) - pad), min(w, int(cx + r) + pad), min(h, int(cy + r) + pad)))
    out.save(path, quality=85)
    print(path, out.size)

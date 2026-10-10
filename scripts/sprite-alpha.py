#!/usr/bin/env python3
"""Keys the generated ship sprites out of their chroma-green backgrounds.

The image model paints each ship on flat #00FF00. Pixels are made transparent by how
much greener they are than their red and blue, green spill on the hull edges is
removed, and the sprite is cropped to the ship. Run after scripts/gen-assets.mjs:

    python3 scripts/sprite-alpha.py public/art/ships/*.webp
"""
import sys
from PIL import Image, ImageFilter

for path in sys.argv[1:]:
    im = Image.open(path).convert("RGB")
    px = im.load()
    w, h = im.size
    alpha = Image.new("L", im.size, 0)
    a = alpha.load()
    out = Image.new("RGBA", im.size)
    o = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            other = max(r, b)
            green = g - other  # ~255 on the backdrop, ~0 on a neutral hull
            v = 255 if green < 40 else 0 if green > 140 else int(255 * (140 - green) / 100)
            a[x, y] = v
            o[x, y] = (r, min(g, other + 12), b, 255)  # despill
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    out.putalpha(alpha)
    box = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
    if box:
        pad = 4
        out = out.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad)))
    out.save(path, quality=88)
    print(path, out.size)

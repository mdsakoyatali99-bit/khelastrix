"""Rasterise the Khelastrix logo to PNG icons (no external SVG renderer needed)."""
from PIL import Image, ImageDraw, ImageChops
import sys, os

OUT = sys.argv[1] if len(sys.argv) > 1 else "public/icons"
S = 4  # supersample

def bez(p0, p1, p2, p3, n=24):
    pts = []
    for i in range(n + 1):
        t = i / n; u = 1 - t
        pts.append((u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
                    u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]))
    return pts

wing1 = bez((47,56),(38,42),(24,31),(8,27)) + bez((8,27),(15,38),(22,49),(33,61))
wing2 = bez((47,62),(39,52),(27,46),(14,45)) + bez((14,45),(20,53),(26,61),(35,69))
wing3 = bez((47,68),(41,62),(32,59),(22,60)) + bez((22,60),(27,66),(32,72),(39,77))
gem = [(50,38),(58,55),(50,79),(42,55)]

def gradient(size):
    g = Image.new("RGB", (size, size))
    px = g.load()
    stops = [(0.0,(63,240,208)),(0.55,(122,92,255)),(1.0,(255,122,184))]
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            for (a, ca), (b, cb) in zip(stops, stops[1:]):
                if a <= t <= b:
                    k = (t - a) / (b - a)
                    px[x, y] = tuple(int(ca[i] + (cb[i] - ca[i]) * k) for i in range(3))
                    break
    return g

def render(size, scale_logo=1.0, rounded=True):
    W = size * S
    base = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    bg = (10, 11, 26, 255)
    if rounded: d.rounded_rectangle((0, 0, W - 1, W - 1), radius=int(W * 0.22), fill=bg)
    else: d.rectangle((0, 0, W, W), fill=bg)

    def tx(pts, mirror=False):
        out = []
        for x, y in pts:
            if mirror: x = 100 - x
            x = 50 + (x - 50) * scale_logo; y = 50 + (y - 50) * scale_logo
            out.append((x * W / 100, y * W / 100))
        return out

    grad = gradient(W).convert("RGBA")
    for mirror in (False, True):
        for poly, alpha in ((wing1, 255), (wing2, 205), (wing3, 158)):
            m = Image.new("L", (W, W), 0)
            ImageDraw.Draw(m).polygon(tx(poly, mirror), fill=alpha)
            base.paste(grad, (0, 0), m)
    d = ImageDraw.Draw(base)
    d.polygon(tx(gem), fill=bg, outline=(122, 92, 255, 255), width=max(2, W // 80))
    cx, cy = tx([(50, 55)])[0]; r = 5 * scale_logo * W / 100
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 200, 87, 255))
    return base.resize((size, size), Image.LANCZOS)

os.makedirs(OUT, exist_ok=True)
render(512).save(f"{OUT}/icon-512.png")
render(192).save(f"{OUT}/icon-192.png")
render(512, scale_logo=0.7, rounded=False).save(f"{OUT}/icon-maskable-512.png")
render(180, rounded=False).save(f"{OUT}/apple-touch-icon.png")
print("icons written to", OUT)

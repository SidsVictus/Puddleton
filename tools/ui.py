"""Generates the UI art in ../ui as small SVG files: icons, the lock badge and 9-slice frames, in the two picture looks.
High (ui/*.svg) is smooth like the 3D beans: every shape is written as a real SVG circle, rounded rect, polygon or round
capped stroke, so edges are anti-aliased and crisp at any size. Low (ui/low/*.svg) is chunky square pixels: the same
shapes rasterised on a 16 x 16 grid, so an icon shown at 32 to 48px has art pixels 2 to 3px big. Icons drawn at 16px or
less in Low use ui/low/sm/*.svg: the same pictures redrawn by hand on an 8 x 8 grid (2px art pixels at 16px).
Both looks share the palette and the dark outline (one grid unit around everything in High, one art pixel in Low).
Frames are 24 x 24 px in both looks and sliced 8px from every edge, so border-image layout never moves:
High has smooth rounded corners, Low is 12 x 12 art pixels drawn 2px big with stepped corners.
Run: python tools/ui.py"""
import math
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ui")
PAL = {"a": "#ffc45a", "m": "#fff1cf", "r": "#ff6b9a", "t": "#6fe3cf", "d": "#c98a2a", "k": "#1c1330", "p": "#cfc5ec", "b": "#ff4d6a",
       "h": "#ffe7a6"}
OUTLINE = "#1c1330"
N = 32      # icon grid, in shape units
LOW = 16    # Low icons: pixels across
SS = 4      # samples per pixel side when rasterising


def num(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def pts(p):
    return " ".join(f"{num(x)},{num(y)}" for x, y in p)


# ---------- shapes: each is a test (x, y) -> inside in grid units, for Low, and the same shape as an SVG element, for High ----------
class Shape:
    """w is the width of a stroked shape (line, arc), 0 for a filled one."""

    def __init__(self, test, el, w=0):
        self.test, self.el, self.w = test, el, w

    def __call__(self, x, y):
        return self.test(x, y)

    def svg(self, col, grow=0):
        """The element painted col and grown outward by grow units. grow -1 is for erasers inside a mask: a white rim
        keeps a one unit band just inside the edge, so the eraser shrinks by one."""
        if self.w:
            return f'<{self.el} fill="none" stroke="{col}" stroke-width="{num(self.w + 2 * grow)}"/>'
        if grow:
            return f'<{self.el} fill="{col}" stroke="{col if grow > 0 else "#fff"}" stroke-width="{2 * abs(grow)}"/>'
        return f'<{self.el} fill="{col}"/>'


def circle(cx, cy, r):
    return Shape(lambda x, y: (x - cx) ** 2 + (y - cy) ** 2 <= r * r, f'circle cx="{num(cx)}" cy="{num(cy)}" r="{num(r)}"')


def rect(x0, y0, x1, y1, r=0.0):
    def f(x, y):
        if not (x0 <= x <= x1 and y0 <= y <= y1):
            return False
        dx, dy = max(x0 + r - x, 0, x - (x1 - r)), max(y0 + r - y, 0, y - (y1 - r))
        return dx * dx + dy * dy <= r * r
    return Shape(f, f'rect x="{num(x0)}" y="{num(y0)}" width="{num(x1 - x0)}" height="{num(y1 - y0)}"' + (f' rx="{num(r)}"' if r else ""))


def poly(*p):
    def f(x, y):
        inside, j = False, len(p) - 1
        for i, (xi, yi) in enumerate(p):
            xj, yj = p[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
        return inside
    return Shape(f, f'polygon points="{pts(p)}"')


def line(*p, w):
    """A stroke of width w through the points, with round joins and caps."""
    segs = list(zip(p, p[1:]))

    def f(x, y):
        for (ax, ay), (bx, by) in segs:
            vx, vy = bx - ax, by - ay
            t = max(0.0, min(1.0, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)))
            if (x - ax - t * vx) ** 2 + (y - ay - t * vy) ** 2 <= w * w / 4:
                return True
        return False
    return Shape(f, f'polyline points="{pts(p)}"', w)


def arc(cx, cy, r, w, a0, a1):
    """A band of width w along a circle, from angle a0 to a1 in degrees (0 is right, 90 is down), with round ends."""
    at = [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in (a0, a1)]
    ends = [circle(x, y, w / 2) for x, y in at]

    def f(x, y):
        if any(e(x, y) for e in ends):
            return True
        d = math.hypot(x - cx, y - cy)
        if abs(d - r) > w / 2:
            return False
        a = math.degrees(math.atan2(y - cy, x - cx))
        while a < a0:
            a += 360
        return a <= a1
    if a1 - a0 >= 360:
        el = f'circle cx="{num(cx)}" cy="{num(cy)}" r="{num(r)}"'
    else:
        (x0, y0), (x1, y1) = at
        el = f'path d="M{num(x0)} {num(y0)}A{num(r)} {num(r)} 0 {int(a1 - a0 > 180)} 1 {num(x1)} {num(y1)}"'
    return Shape(f, el, w)


# ---------- icons: layers of (palette key, shape), painted in order; "" erases ----------
ICONS = {
    "back": [
        ("a", poly((3, 14.5), (14, 4.5), (15.5, 4.5), (15.5, 27.5), (14, 27.5), (3, 17.5))),
        ("a", rect(12, 12, 28.5, 20, 1.5)),
    ],
    "hanger": [
        ("a", arc(16, 6.5, 3.2, 2.4, 160, 420)),
        ("a", line((17.6, 9.3), (16, 12.5), w=2.4)),
        ("a", line((16, 12.5), (5, 22.5), w=3)),
        ("a", line((16, 12.5), (27, 22.5), w=3)),
        ("a", rect(3, 21.5, 29, 26, 1.5)),
    ],
    "help": [
        ("a", arc(16, 12, 7, 6, 185, 405)),
        ("a", line((20.95, 16.95), (16, 20), w=6)),
        ("a", rect(13, 19, 19, 22)),
        ("a", rect(13, 24, 19, 30, 1.5)),
    ],
    "share": [
        ("a", rect(4, 15, 28, 28, 2.5)),
        ("", rect(8, 8, 24, 24)),
        ("a", rect(14, 5, 18, 20)),
        ("a", line((9.5, 10), (16, 3.5), (22.5, 10), w=4)),
    ],
    "door": [
        ("d", rect(4, 4, 18, 28)),
        ("r", rect(6, 6, 16, 26)),
        ("m", rect(12, 15, 14, 17, 0.6)),
        ("m", rect(19.5, 12, 25, 16)),
        ("m", poly((23.5, 7.5), (30, 14), (23.5, 20.5))),
    ],
    "crown": [
        ("a", poly((4, 5), (6.5, 5), (11, 13), (14, 5), (18, 5), (21, 13), (25.5, 5), (28, 5), (28, 22), (4, 22))),
        ("r", circle(8.5, 17.5, 1.9)),
        ("t", circle(16, 17.5, 2.2)),
        ("r", circle(23.5, 17.5, 1.9)),
        ("d", rect(4, 22, 28, 25)),
    ],
    "moon": [
        ("m", circle(16, 16, 12)),
        ("", circle(24, 11.5, 10)),
    ],
    "sun": [
        ("a", circle(16, 16, 8)),
        ("a", rect(14, 2, 18, 6, 1)), ("a", rect(14, 26, 18, 30, 1)), ("a", rect(2, 14, 6, 18, 1)), ("a", rect(26, 14, 30, 18, 1)),
        ("a", line((5.5, 5.5), (8, 8), w=2.6)), ("a", line((26.5, 5.5), (24, 8), w=2.6)),
        ("a", line((5.5, 26.5), (8, 24), w=2.6)), ("a", line((26.5, 26.5), (24, 24), w=2.6)),
        ("m", arc(16, 16, 5, 2, 185, 255)),
    ],
    "check": [
        ("t", line((5.5, 15.5), (12, 22), (26.5, 7.5), w=4.6)),
    ],
    "skull": [
        ("m", rect(4, 4, 28, 21, 7)),
        ("m", rect(8, 18, 24, 27, 2)),
        ("k", circle(10.5, 14, 2.7)),
        ("k", circle(21.5, 14, 2.7)),
        ("k", poly((16, 16), (18, 19.5), (14, 19.5))),
        ("k", rect(11, 22, 13, 26)), ("k", rect(15, 22, 17, 26)), ("k", rect(19, 22, 21, 26)),
    ],
    "clock": [
        ("a", circle(16, 16, 14)),
        ("m", circle(16, 16, 11.8)),
        ("k", rect(15, 7, 17, 17, 1)),
        ("k", rect(15, 15, 24, 17, 1)),
        ("k", circle(16, 16, 1.9)),
    ],
    "book": [
        ("r", rect(4, 5.5, 28, 24.5, 1)),
        ("r", rect(6, 24, 26, 26.5)),
        ("", rect(14, 5, 18, 7.5)),
        ("m", rect(6, 8, 14, 22)),
        ("m", rect(18, 8, 26, 22)),
        ("k", rect(8, 11, 13, 12)), ("k", rect(8, 14, 13, 15)), ("k", rect(8, 17, 11, 18)),
        ("k", rect(19, 11, 24, 12)), ("k", rect(19, 14, 24, 15)), ("k", rect(19, 17, 22, 18)),
    ],
    "hourglass": [
        ("m", poly((8, 6), (24, 6), (24, 8.2), (18, 14.2), (18, 16), (14, 16), (14, 14.2), (8, 8.2))),
        ("m", rect(15, 14, 17, 24)),
        ("m", Shape(lambda x, y: y <= 26 and ((x - 16) / 7) ** 2 + ((y - 26.5) / 4.5) ** 2 <= 1,   # the sand pile
                    'path d="M9.04 26A7 4.5 0 0 1 22.96 26Z"')),
        ("a", line((7, 6), (7, 8.5), (13, 14.5), (13, 17.5), (7, 23.5), (7, 26), w=2)),
        ("a", line((25, 6), (25, 8.5), (19, 14.5), (19, 17.5), (25, 23.5), (25, 26), w=2)),
        ("a", rect(4, 3, 28, 6, 1)),
        ("a", rect(4, 26, 28, 29, 1)),
    ],
    "close": [
        ("a", line((7.5, 7.5), (24.5, 24.5), w=4.8)),
        ("a", line((24.5, 7.5), (7.5, 24.5), w=4.8)),
    ],
}

# Low versions of icons whose thin parts melt on 16 pixels: the same picture with parts snapped to whole pixels
# (one pixel is two shape units) and kept a pixel apart.
LOW_FIX = {
    "book": [
        ("r", rect(4, 6, 28, 24)),
        ("r", rect(6, 24, 26, 26)),
        ("", rect(14, 4, 18, 8)),
        ("m", rect(6, 8, 14, 22)),
        ("m", rect(18, 8, 26, 22)),
        ("k", rect(8, 12, 12, 14)), ("k", rect(8, 16, 12, 18)),
        ("k", rect(20, 12, 24, 14)), ("k", rect(20, 16, 24, 18)),
    ],
}

# The small Low set (low/sm/) for the icons drawn at 16px or less: (pixels across the box, pixel map). Drawn by hand, as
# 16 x 16 sampling halved melts them; no room for the dark ring at this size, so they keep only their inner dark details.
# Most are 8 pixels across the box (2px art pixels at 16px), with odd sized art centred half a pixel in. The skull also sits
# in 12px role tags, so its box is 6 pixels (2px there, 2.7px at 16px). Only these names have a small twin: the list
# in screens/base.mjs (SMALL) must match.
SM_FIX = {
    "crown": (8, [
        "a..aa..a",
        "aa.aa.aa",
        ".aaaaaa.",
        ".arttra.",
        ".dddddd.",
    ]),
    "skull": (6, [
        ".mmm.",
        "mmmmm",
        "mkmkm",
        ".mmm.",
        ".m.m.",
    ]),
    "clock": (8, [
        "..aaa..",
        ".ammma.",
        "ammkmma",
        "ammkkma",
        "ammmmma",
        ".ammma.",
        "..aaa..",
    ]),
    "book": (8, [
        "rrr.rrr",
        "rmmrmmr",
        "rkmrkmr",
        "rmmrmmr",
        "rmmrmmr",
        ".rrrrr.",
    ]),
}
# The lock badge in Quick Play rows is 15 x 18px: 7 x 8 pixels, 2px big.
LOCK_SM = [
    "..aaa..",
    ".a...a.",
    ".a...a.",
    "aaaaaaa",
    "ahaaaaa",
    "ahakaaa",
    "aaakaaa",
    "aaaaaaa",
]

# The padlock on locked outfits and private rooms: 18 x 21 units. High lives at ../lock.svg, Low with the other Low icons.
LOCK = [
    ("a", arc(9.5, 7.5, 4.5, 2, 180, 360)),
    ("a", rect(4, 7.5, 6, 11)), ("a", rect(13, 7.5, 15, 11)),
    ("a", rect(2, 10, 17, 20, 1)),
    ("h", line((4.5, 14.5), (4.5, 12.5), (7.5, 12.5), w=1)),
    ("k", circle(9.5, 14.2, 1.6)),
    ("k", rect(9, 14.5, 10, 18, 0.4)),
]
# Low draws it by hand: at 9 x 10 pixels a rasterised shackle comes out lopsided. K is the outline.
LOCK_LOW = [
    "...KKK...",
    "..KaaaK..",
    ".KaKKKaK.",
    ".KaK.KaK.",
    "KKaKKKaKK",
    "KaaaaaaaK",
    "KahhaaaaK",
    "KahaKaaaK",
    "KaaaKaaaK",
    "KKKKKKKKK",
]


def raster(layers, w=N, h=N, k=1):
    """Colour each pixel by its majority of SS x SS samples; a pixel needs half its samples covered to be filled.
    k is how many pixels make one shape unit (0.5 draws the 32 unit shapes on a 16 pixel grid)."""
    grid = {}
    for y in range(h):
        for x in range(w):
            counts = {}
            for sy in range(SS):
                for sx in range(SS):
                    px, py, col = (x + (sx + 0.5) / SS) / k, (y + (sy + 0.5) / SS) / k, ""
                    for key, f in layers:
                        if f(px, py):
                            col = key
                    counts[col] = counts.get(col, 0) + 1
            if counts.get("", 0) * 2 <= SS * SS:
                grid[(x, y)] = max((c for c in counts if c), key=lambda c: counts[c])
    return grid


def runs(cells, color, s=1, ox=0, oy=0):
    """Merge a set of (x, y) cells into horizontal runs, stacking runs that repeat on the next row, as one path."""
    done, live = [], {}   # live: (x0, x1) -> [y0, rows]
    for y in sorted({c[1] for c in cells}):
        xs, row = sorted(x for x, yy in cells if yy == y), set()
        start = prev = xs[0]
        for x in xs[1:] + [None]:
            if x is None or x != prev + 1:
                row.add((start, prev + 1))
                start = x
            prev = x if x is not None else prev
        for k in [k for k, (y0, h) in live.items() if k not in row or y0 + h != y]:
            done.append((k, live.pop(k)))
        for k in row:
            live.setdefault(k, [y, 0])[1] += 1
    d = ""
    for (x0, x1), (y0, h) in sorted(done + list(live.items()), key=lambda r: (r[1][0], r[0][0])):
        d += f"M{(x0 + ox) * s} {(y0 + oy) * s}h{(x1 - x0) * s}v{h * s}h-{(x1 - x0) * s}z"
    return f'<path fill="{color}" d="{d}"/>' if d else ""


def outlined(grid, w, h):
    """Paths for the cells plus a one pixel dark outline around everything filled."""
    by = {}
    for cell, key in grid.items():
        by.setdefault(PAL.get(key, key), set()).add(cell)
    filled = set(grid)
    edge = {(x + dx, y + dy) for x, y in filled for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))} - filled
    edge = {(x, y) for x, y in edge if 0 <= x < w and 0 <= y < h}
    return runs(edge, OUTLINE) + "".join(runs(c, col) for col, c in by.items())


def vector(layers, w, h):
    """High: the outline is every shape grown by one unit in the dark ink, laid under the same shapes in colour.
    An eraser masks out everything painted before it; in the ink it is shrunk by one unit, so its hole gets an edge too."""
    defs, ink, paint = "", "", ""
    box = f'x="-2" y="-2" width="{w + 4}" height="{h + 4}"'
    for i, (key, s) in enumerate(layers):
        if key:
            ink += s.svg(OUTLINE, 1)
            paint += s.svg(PAL.get(key, key))
            continue
        for m, body in ((f"o{i}", s.svg("#000", -1)), (f"p{i}", s.svg("#000"))):
            defs += f'<mask id="{m}" maskUnits="userSpaceOnUse" {box}><rect {box} fill="#fff"/>{body}</mask>'
        ink, paint = f'<g mask="url(#o{i})">{ink}</g>', f'<g mask="url(#p{i})">{paint}</g>'
    return (f"<defs>{defs}</defs>" if defs else "") + ink + paint


def smooth_svg(body, w, h):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            f'stroke-linecap="round" stroke-linejoin="round">{body}</svg>')


def pixel_svg(body, vb, w, h):
    """A pixel drawing on the vb grid, shown at the same w x h size as its High twin."""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}" shape-rendering="crispEdges">{body}</svg>'


def pixmap(rows):
    """Paths for a hand drawn pixel map: one palette key per pixel, K for the outline ink, . for empty."""
    cells = {(x, y): c for y, row in enumerate(rows) for x, c in enumerate(row) if c != "."}
    return "".join(runs({p for p, c in cells.items() if c == key}, OUTLINE if key == "K" else PAL[key]) for key in dict.fromkeys(cells.values()))


def icon(name, layers, low=None, sm=None):
    """low: shapes snapped to the 16 pixel grid for icons whose fine detail would melt there (defaults to layers).
    sm: (box, pixel map) for the small Low twin in low/sm/, for icons drawn at 16px or less; the art is centred in a box
    pixels across, shown at the same 32 x 32 as the others."""
    save(f"{name}.svg", smooth_svg(vector(layers, N, N), N, N))
    save(f"low/{name}.svg", pixel_svg(outlined(raster(low or layers, LOW, LOW, LOW / N), LOW, LOW), f"0 0 {LOW} {LOW}", N, N))
    if sm:
        box, rows = sm
        save(f"low/sm/{name}.svg", pixel_svg(pixmap(rows), f"{num((len(rows[0]) - box) / 2)} {num((len(rows) - box) / 2)} {box} {box}", N, N))


def lock():
    with open(os.path.join(OUT, "..", "lock.svg"), "w", encoding="utf-8") as f:
        f.write(smooth_svg(vector(LOCK, 18, 21), 18, 21))
    print("../lock.svg")
    save("low/lock.svg", pixel_svg(pixmap(LOCK_LOW), "0 -0.5 9 10.5", 18, 21))   # 10 rows over units 1 to 21, like High
    save("low/sm/lock.svg", pixel_svg(pixmap(LOCK_SM), "0 -0.5 7.5 9", 18, 21))   # its 15 x 18px box is 7.5 x 9 pixels at 2px


def rr(i, r, n=24):
    """A rounded rect inset i from every edge of the n x n frame, corner radius r, as path data."""
    a, b = i + r, n - i - r
    return (f"M{num(a)} {num(i)}H{num(b)}A{num(r)} {num(r)} 0 0 1 {num(n - i)} {num(a)}V{num(b)}A{num(r)} {num(r)} 0 0 1 {num(b)} {num(n - i)}"
            f"H{num(a)}A{num(r)} {num(r)} 0 0 1 {num(i)} {num(b)}V{num(a)}A{num(r)} {num(r)} 0 0 1 {num(a)} {num(i)}Z")


def frame(name, edge, fill, opacity=1.0, shade=None):
    """A one pixel dark outline, a two pixel coloured edge and a flat fill, on 24 x 24 px sliced 8px from every edge.
    shade: a darker lip along the bottom edge, like a raised game button."""
    op = f' opacity="{opacity}"' if opacity < 1 else ""
    # High: concentric rounded rects (radius 6 outside, so the curve stays inside the 8px corner slice)
    body = f'<path fill="#06041a" fill-rule="evenodd" d="{rr(0, 6)}{rr(3, 3)}"/><path fill="{edge}" fill-rule="evenodd" d="{rr(1, 5)}{rr(3, 3)}"/>'
    if shade:
        body += f'<path fill="{shade}" d="M2 21H22A5 5 0 0 1 18 23H6A5 5 0 0 1 2 21Z"/>'
    body += f'<path fill="{fill}"{op} d="{rr(3, 3)}"/>'
    save(f"{name}.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">{body}</svg>')

    # Low: 12 x 12 art pixels shown 2px big, so the 8px slice is 4 pixels; stepped corners, a one pixel edge
    n, corner = 12, (2, 1)   # how far each of the first rows is pulled in at a corner

    def inset(i):
        return corner[i] if i < len(corner) else 0

    def erode(cells):
        return {(x, y) for x, y in cells if all((x + dx, y + dy) in cells for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))}

    shape = {(x, y) for x in range(n) for y in range(n)
             if min(x, n - 1 - x) >= inset(min(y, n - 1 - y)) and min(y, n - 1 - y) >= inset(min(x, n - 1 - x))}
    inner1 = erode(shape)
    inner2 = erode(inner1)
    band = inner1 - inner2
    lip = {(x, y) for x, y in band if y >= n - 2} if shade else set()
    body = runs(shape - inner1, "#06041a") + runs(band - lip, edge)
    body += f'<g{op}>{runs(inner2, fill)}</g>' if op else runs(inner2, fill)
    if shade:
        body += runs(lip, shade)
    save(f"low/{name}.svg", pixel_svg(body, f"0 0 {n} {n}", 24, 24))


def save(name, svg):
    os.makedirs(os.path.dirname(os.path.join(OUT, name)), exist_ok=True)
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(svg)
    print(name, len(svg), "bytes")


if __name__ == "__main__":
    for k, v in ICONS.items():
        icon(k, v, LOW_FIX.get(k), SM_FIX.get(k))
    lock()
    frame("plate", "#5a4f9c", "#110d2b", 0.94)          # the standard dark panel behind text
    frame("plate-gold", "#ffc45a", "#17123a", 0.96)     # highlighted: your card, a selected choice
    frame("plate-teal", "#6fe3cf", "#0f1c33", 0.96)     # confirmed: your move is locked in
    frame("plate-rose", "#ff6b9a", "#22102e", 0.96)     # danger and bad news
    frame("slot", "#3a3360", "#0a0820")                 # inset slot: text fields and chat logs
    frame("slot-focus", "#ffc45a", "#0a0820")           # the same slot while you type in it
    frame("tile", "#5a4f9c", "#241c52", shade="#171238")   # raised tile for icon buttons
    frame("tile-gold", "#ffc45a", "#30265e", shade="#171238")   # the same tile under the pointer or chosen

"""Generates the pixel-art UI assets in ../ui as small SVG files: icons and 9-slice frames.
Icons are drawn as simple shapes, rasterised into crisp pixels and given a one pixel dark outline automatically.
Each icon holds two drawings of the same shapes: a 32 x 32 one for small sizes and a 64 x 64 one that the icon
switches to (by a media query inside the SVG) when it is shown at 48px or more, so one art pixel stays one screen pixel.
Frames are 24 x 24 art pixels at one screen pixel each, sliced 8 pixels from every edge, with smooth stepped corners.
Run: python tools/ui.py"""
import math
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ui")
PAL = {"a": "#ffc45a", "m": "#fff1cf", "r": "#ff6b9a", "t": "#6fe3cf", "d": "#c98a2a", "k": "#1c1330", "p": "#cfc5ec", "b": "#ff4d6a"}
OUTLINE = "#1c1330"
N = 32      # icon grid
SS = 4      # samples per pixel side when rasterising


# ---------- shapes: each is a test (x, y) -> inside, in grid units ----------
def circle(cx, cy, r):
    return lambda x, y: (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def rect(x0, y0, x1, y1, r=0.0):
    def f(x, y):
        if not (x0 <= x <= x1 and y0 <= y <= y1):
            return False
        dx, dy = max(x0 + r - x, 0, x - (x1 - r)), max(y0 + r - y, 0, y - (y1 - r))
        return dx * dx + dy * dy <= r * r
    return f


def poly(*pts):
    def f(x, y):
        inside, j = False, len(pts) - 1
        for i, (xi, yi) in enumerate(pts):
            xj, yj = pts[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
        return inside
    return f


def line(*pts, w):
    """A stroke of width w through the points, with round joins and caps."""
    segs = list(zip(pts, pts[1:]))

    def f(x, y):
        for (ax, ay), (bx, by) in segs:
            vx, vy = bx - ax, by - ay
            t = max(0.0, min(1.0, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)))
            if (x - ax - t * vx) ** 2 + (y - ay - t * vy) ** 2 <= w * w / 4:
                return True
        return False
    return f


def arc(cx, cy, r, w, a0, a1):
    """A band of width w along a circle, from angle a0 to a1 in degrees (0 is right, 90 is down), with round ends."""
    ends = [circle(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)), w / 2) for a in (a0, a1)]

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
    return f


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
        ("m", lambda x, y: y <= 26 and ((x - 16) / 7) ** 2 + ((y - 26.5) / 4.5) ** 2 <= 1),
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


def raster(layers, w=N, h=N, k=1):
    """Colour each pixel by its majority of SS x SS samples; a pixel needs half its samples covered to be filled.
    k is how many pixels make one shape unit (2 draws the 32 unit shapes on a 64 pixel grid)."""
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


def icon(name, layers):
    small, large = outlined(raster(layers), N, N), outlined(raster(layers, 2 * N, 2 * N, 2), 2 * N, 2 * N)
    swap = "<style>.l{display:none}@media (min-width:48px){.s{display:none}.l{display:inline}}</style>"
    save(f"{name}.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {N} {N}" width="{N}" height="{N}" shape-rendering="crispEdges">'
         f'{swap}<g class="s">{small}</g><g class="l" transform="scale(.5)">{large}</g></svg>')


def frame(name, edge, fill, opacity=1.0, shade=None):
    """24 x 24 art pixels at one screen pixel each: a one pixel dark outline with rounded stepped corners,
    a two pixel coloured edge, a flat fill."""
    n, corner = 24, (4, 2, 1, 1)   # how far each of the first rows is pulled in at a corner

    def inset(i):
        return corner[i] if i < len(corner) else 0

    def erode(cells):
        return {(x, y) for x, y in cells if all((x + dx, y + dy) in cells for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))}

    shape = {(x, y) for x in range(n) for y in range(n)
             if min(x, n - 1 - x) >= inset(min(y, n - 1 - y)) and min(y, n - 1 - y) >= inset(min(x, n - 1 - x))}
    inner1 = erode(shape)
    inner2 = erode(erode(inner1))
    band = inner1 - inner2
    lip = {(x, y) for x, y in band if y >= n - 3} if shade else set()
    body = runs(shape - inner1, "#06041a") + runs(band - lip, edge)
    body += f'<g opacity="{opacity}">{runs(inner2, fill)}</g>' if opacity < 1 else runs(inner2, fill)
    if shade:   # a darker lip along the bottom edge, like a raised game button
        body += runs(lip, shade)
    save(f"{name}.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}" width="{n}" height="{n}" shape-rendering="crispEdges">{body}</svg>')


def save(name, svg):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(svg)
    print(name, len(svg), "bytes")


if __name__ == "__main__":
    for k, v in ICONS.items():
        icon(k, v)
    frame("plate", "#5a4f9c", "#110d2b", 0.94)          # the standard dark panel behind text
    frame("plate-gold", "#ffc45a", "#17123a", 0.96)     # highlighted: your card, a selected choice
    frame("plate-teal", "#6fe3cf", "#0f1c33", 0.96)     # confirmed: your move is locked in
    frame("plate-rose", "#ff6b9a", "#22102e", 0.96)     # danger and bad news
    frame("slot", "#3a3360", "#0a0820")                 # inset slot: text fields and chat logs
    frame("slot-focus", "#ffc45a", "#0a0820")           # the same slot while you type in it
    frame("tile", "#5a4f9c", "#241c52", shade="#171238")   # raised tile for icon buttons
    frame("tile-gold", "#ffc45a", "#30265e", shade="#171238")   # the same tile under the pointer or chosen

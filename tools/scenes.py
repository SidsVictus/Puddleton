"""Generates the pixel-art scene backdrops in ../scenes as small animated SVG files.
Each scene is laid out on a 320 x 180 art grid and rasterized at S fine pixels per art unit (a 960 x 540 viewBox),
drawn with crisp staircase outlines, fine dither patterns and CSS animation.
Run: python tools/scenes.py"""
import math, os, random

S = 3                   # fine pixels per art unit
P = 1 / S               # one fine pixel, in art units
W, H = 320, 180         # the art grid
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scenes")
# animation distances are in fine pixels (3 per art unit), so motion matches the art grid
CSS = """
.tw{animation:tw 4s steps(1) infinite}@keyframes tw{50%{opacity:.15}}
.blink{animation:bl 9s steps(1) infinite}@keyframes bl{0%,78%{opacity:1}79%,100%{opacity:.12}}
.flick{animation:fl 1.4s steps(2) infinite}@keyframes fl{50%{opacity:.55}}
.drift{animation:dr 140s steps(1680) infinite}@keyframes dr{from{transform:translateX(-360px)}to{transform:translateX(1320px)}}
.slow{animation-duration:260s}
.smoke{animation:sm 5s steps(24) infinite}@keyframes sm{from{transform:translate(0,0);opacity:.9}to{transform:translate(12px,-48px);opacity:0}}
.sway{animation:sw 2.4s steps(3) infinite alternate}@keyframes sw{to{transform:translateY(3px)}}
.bob{animation:bo 6s steps(12) infinite alternate}@keyframes bo{to{transform:translateY(-12px)}}
.spark{animation:sp 2.2s steps(1) infinite}@keyframes sp{50%{opacity:0}}
.fw{transform-box:fill-box;transform-origin:center;animation:fw 3.2s steps(12) infinite}@keyframes fw{0%{transform:scale(.1);opacity:0}10%{opacity:1}70%{opacity:1}100%{transform:scale(1);opacity:0}}
.fall{animation:fa 7s steps(84) infinite}@keyframes fa{from{transform:translateY(-90px)}to{transform:translateY(600px)}}
.ff{animation:ff 5s steps(20) infinite alternate}@keyframes ff{0%{transform:translate(0,0);opacity:0}30%{opacity:1}100%{transform:translate(15px,-21px);opacity:.2}}
.eyes{animation:ey 11s steps(1) infinite}@keyframes ey{0%,88%{opacity:0}89%,93%{opacity:1}94%{opacity:0}95%,98%{opacity:1}99%{opacity:0}}
.spin{transform-box:fill-box;transform-origin:center;animation:spn 8s steps(24) infinite}@keyframes spn{to{transform:rotate(360deg)}}
.tick{transform-origin:480px 240px;animation:tk 1s steps(6) infinite alternate}@keyframes tk{from{transform:rotate(-8deg)}to{transform:rotate(8deg)}}
.shoot{animation:sh 13s steps(52) infinite}@keyframes sh{0%,80%{transform:translate(0,0);opacity:0}81%{opacity:1}100%{transform:translate(-270px,135px);opacity:0}}
"""


def fx(v):   # art units to the nearest fine pixel edge
    return math.floor(v * S + 0.5 + 1e-9)


def mix(a, b, t):   # blend two #rrggbb colours
    a, b = int(a[1:], 16), int(b[1:], 16)
    return "#%02x%02x%02x" % tuple(round(((a >> k) & 255) * (1 - t) + ((b >> k) & 255) * t) for k in (16, 8, 0))


# ---- shapes as fine-pixel spans: lists of (fine y, fine x0, fine x1) ----

def box(x, y, w, h):
    a, b = fx(x), fx(x + w)
    return [(fy, a, b) for fy in range(fx(y), fx(y + h))] if b > a else []


def ell(cx, cy, rx, ry):
    rows = []
    for fy in range(math.floor((cy - ry) * S), math.ceil((cy + ry) * S)):
        dy = ((fy + 0.5) / S - cy) / ry
        if abs(dy) < 1:
            hw = rx * math.sqrt(1 - dy * dy)
            a, b = fx(cx - hw), fx(cx + hw)
            if b > a:
                rows.append((fy, a, b))
    return rows


def poly(pts):   # convex polygon
    rows, n = [], len(pts)
    ys = [p[1] for p in pts]
    for fy in range(math.floor(min(ys) * S), math.ceil(max(ys) * S)):
        yc, xs = (fy + 0.5) / S, []
        for i in range(n):
            (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % n]
            if (y1 <= yc < y2) or (y2 <= yc < y1):
                xs.append(x1 + (yc - y1) * (x2 - x1) / (y2 - y1))
        if len(xs) >= 2:
            a, b = fx(min(xs)), fx(max(xs))
            if b > a:
                rows.append((fy, a, b))
    return rows


def rrect(x, y, w, h, r):   # rounded rectangle
    rows = []
    for fy in range(fx(y), fx(y + h)):
        yc = (fy + 0.5) / S
        d = min(yc - y, y + h - yc)
        inset = r - math.sqrt(max(0.0, r * r - (r - d) ** 2)) if d < r else 0
        a, b = fx(x + inset), fx(x + w - inset)
        if b > a:
            rows.append((fy, a, b))
    return rows


def union(*lists):
    by = {}
    for rows in lists:
        for y, a, b in rows:
            by.setdefault(y, []).append((a, b))
    out = []
    for y in sorted(by):
        iv = sorted(by[y])
        cur = list(iv[0])
        for a, b in iv[1:]:
            if a <= cur[1]:
                cur[1] = max(cur[1], b)
            else:
                out.append((y, *cur)); cur = [a, b]
        out.append((y, *cur))
    return out


def minus(rows, cut):   # spans of rows not covered by cut (cut has one span per row)
    c = {y: (a, b) for y, a, b in cut}
    out = []
    for y, a, b in rows:
        if y not in c:
            out.append((y, a, b)); continue
        ca, cb = c[y]
        if ca > a:
            out.append((y, a, min(b, ca)))
        if cb < b:
            out.append((y, max(a, cb), b))
    return [r for r in out if r[2] > r[1]]


def clip(rows, y0=-1e9, y1=1e9, x0=-1e9, x1=1e9):   # bounds in art units
    Y0, Y1, X0, X1 = fx(y0) if y0 > -1e8 else -10 ** 9, fx(y1) if y1 < 1e8 else 10 ** 9, fx(x0) if x0 > -1e8 else -10 ** 9, fx(x1) if x1 < 1e8 else 10 ** 9
    return [(y, max(a, X0), min(b, X1)) for y, a, b in rows if Y0 <= y < Y1 and min(b, X1) > max(a, X0)]


def shift(rows, dx=0, dy=0):   # move by whole fine pixels
    return [(y + dy, a + dx, b + dx) for y, a, b in rows]


def outline(spans):   # staircase outline path data, one closed subpath per vertical chain of overlapping spans
    rows = {}
    for y, a, b in spans:
        if b > a:
            rows.setdefault(y, []).append((a, b))
    chains, live = [], []
    for y in sorted(rows):
        nxt = []
        for a, b in sorted(rows[y]):
            hit = [c for c in live if c[-1][0] == y - 1 and c[-1][1] < b and c[-1][2] > a]
            if len(hit) == 1 and not any(c is hit[0] for c in nxt):
                hit[0].append((y, a, b)); nxt.append(hit[0])
            else:
                c = [(y, a, b)]; chains.append(c); nxt.append(c)
        live = nxt
    d = []
    for c in chains:
        y0, a0, b0 = c[0]
        d.append(f"M{a0} {y0}h{b0 - a0}")
        v = 1
        for (_, _, b), (_, _, b2) in zip(c, c[1:]):
            if b2 == b:
                v += 1
            else:
                d.append(f"v{v}h{b2 - b}"); v = 1
        _, al, bl = c[-1]
        d.append(f"v{v}h{al - bl}")
        v, rev = 1, c[::-1]
        for (_, a, _), (_, a2, _) in zip(rev, rev[1:]):
            if a2 == a:
                v += 1
            else:
                d.append(f"v-{v}h{a2 - a}"); v = 1
        d.append("z")
    return "".join(d)


class Scene:
    def __init__(self, seed):
        self.out, self.pats = [], {}
        self.rng = random.Random(seed)          # drives the layout (kept as before)
        self.fine = random.Random(seed + 100)   # drives the extra fine detail

    def path(self, d, fill, cls="", style=""):
        if d:
            a = (f' class="{cls}"' if cls else "") + (f' style="{style}"' if style else "")
            self.out.append(f'<path d="{d}" fill="{fill}"{a}/>')

    def fruns(self, rects, fill, cls="", style=""):   # rects in fine pixels
        merged = []
        for x, y, w, h in sorted((r for r in rects if r[2] > 0 and r[3] > 0), key=lambda r: (r[0], r[2], r[1])):
            m = merged[-1] if merged else None
            if m and m[0] == x and m[2] == w and m[1] + m[3] == y:
                m[3] += h
            else:
                merged.append([x, y, w, h])
        self.path("".join(f"M{x} {y}h{w}v{h}h-{w}z" for x, y, w, h in merged), fill, cls, style)

    def runs(self, rects, fill, cls="", style=""):   # rects in art units (fine fractions allowed)
        fr = []
        for x, y, w, h in rects:
            a, t = fx(x), fx(y)
            fr.append((a, t, fx(x + w) - a, fx(y + h) - t))
        self.fruns(fr, fill, cls, style)

    def rect(self, x, y, w, h, c, **k): self.runs([(x, y, w, h)], c, **k)

    def shape(self, rows, fill, cls="", style=""): self.path(outline(rows), fill, cls, style)

    def open(self, cls="", style="", tf=""):
        self.out.append("<g" + (f' class="{cls}"' if cls else "") + (f' style="{style}"' if style else "") + (f' transform="{tf}"' if tf else "") + ">")

    def close(self): self.out.append("</g>")

    def dither(self, a, b, lvl=2):   # checker of b over a in 1 fine pixel cells: lvl 1, 2, 3 = 25, 50, 75 percent (a=None leaves gaps clear)
        key = f"d{lvl}{(a or 'none').strip('#')}{b.strip('#')}"
        if key not in self.pats:
            cells = [(0, 0), (1, 1), (1, 0)][:lvl]
            bg = f'<rect width="2" height="2" fill="{a}"/>' if a else ""
            self.pats[key] = (f'<pattern id="{key}" width="2" height="2" patternUnits="userSpaceOnUse">{bg}'
                              f'<path d="{"".join(f"M{x} {y}h1v1h-1z" for x, y in cells)}" fill="{b}"/></pattern>')
        return f"url(#{key})"

    def sky(self, bands, y=0):   # flat bands joined by a three step 75 / 50 / 25 percent dither
        for i, (c, end) in enumerate(bands):
            self.rect(0, y, W, end - y, c)
            if i:
                for k, lvl in enumerate((3, 2, 1)):
                    self.rect(0, y + k, W, 1, self.dither(c, bands[i - 1][0], lvl))
            y = end

    def disc(self, cx, cy, r, c, cls="", style="", half=False):   # same footprint as the old row disc, drawn smooth
        rows = ell(cx, cy + 0.5, r + 0.5, r + 0.5)
        self.shape(clip(rows, y1=cy + 1) if half else rows, c, cls, style)

    def stars(self, n, ymax, colors=("#fff1cf", "#cfc5ec")):
        for _ in range(n):
            x, y = self.rng.randrange(W), self.rng.randrange(ymax)
            c, big = self.rng.choice(colors), self.rng.random() < 0.15
            X, Y = fx(x) + self.fine.randrange(3), fx(y) + self.fine.randrange(3)
            if big:
                rects = [(X - 3, Y, 7, 1), (X, Y - 3, 1, 7), (X - 1, Y - 1, 3, 3)]
            elif self.fine.random() < 0.4:
                rects = [(X, Y, 2, 2)]
            else:
                rects = [(X, Y, 1, 1)]
            self.fruns(rects, c, "tw", f"animation-delay:-{self.rng.random() * 4:.1f}s")

    def cloud(self, x, y, w, c, shade, cls="drift", delay=0):   # round puffs on a flat, shaded underside
        self.open(cls, f"animation-delay:-{delay}s")
        h = max(3, w // 5)
        bot = y + h + 4
        rows = clip(union(ell(x + w * 0.42, y + w * 0.17, w * 0.17, w * 0.17), ell(x + w * 0.65, y + 2 + w * 0.13, w * 0.13, w * 0.13),
                          ell(x + w * 0.22, y + h + 0.3, w * 0.11, w * 0.11), ell(x + w * 0.84, y + h + 1, w * 0.085, w * 0.085),
                          rrect(x, y + h - 1, w, 5, 2.4)), y1=bot)
        self.shape(rows, c)
        sh = fx(bot - 1)
        self.shape([r for r in rows if r[0] >= sh], shade)
        self.shape([r for r in rows if r[0] == sh - 1], self.dither(c, shade))
        self.close()

    def roof(self, x, w, base, c, steep=1, rim=None, tiles=None):   # a staircase gable, one fine row per step
        X, B = fx(x), fx(base)
        Wd = fx(x + w) - X
        rows, i = [], 0
        while Wd - 2 * i * steep > 0:
            rows.append((B - 1 - i, X + i * steep, X + Wd - i * steep)); i += 1
        self.shape(rows, c)
        if rim:   # light catching the right hand slope
            self.fruns([(b - steep - 1, y, steep + 1, 1) for y, a, b in rows], rim)
        if tiles:   # rows of shingles
            self.fruns([(a + 2, y, b - a - 4, 1) for y, a, b in rows if (B - 1 - y) % 6 == 5 and b - a > 6], tiles)
        return (B - i) / S

    def pine(self, cx, base, h, c):   # three tiers of drooping boughs
        rows = []
        C = (cx + 0.5) * S
        for tier in range(3):
            top = base - h + tier * h // 4
            bot = top + h // 2
            T, Bt = fx(top), fx(bot)
            spread = h // 6 + tier * 2
            for fy in range(T, Bt):
                t = (fy - T + 0.5) / (Bt - T)
                saw = (t * 3) % 1   # each tier droops in three layers
                hw = (0.6 + t * spread) * S * (0.86 + 0.14 * saw) + 0.5 * S
                rows.append((fy, round(C - hw), round(C + hw)))
        rows += box(cx - 1, base - h // 6, 3, h // 6)
        self.shape(union(rows), c)

    def windows(self, x, y, cols, rowsn, lit, dark, gap=5, size=(2, 3), p=0.55, mull=None, sill=None):
        panes, bars, sills = {lit: [], dark: []}, [], []
        for r in range(rowsn):
            for col in range(cols):
                on = self.rng.random() < p
                blink = on and self.rng.random() < 0.35
                style = f"animation-delay:-{self.rng.random() * 9:.1f}s"
                wx, wy = x + col * gap, y + r * (size[1] + 3)
                X, Y, Wd, Hd = fx(wx), fx(wy), fx(wx + size[0]) - fx(wx), fx(wy + size[1]) - fx(wy)
                cross = [(X + Wd // 2, Y, 1, Hd), (X, Y + Hd // 2 - 1, Wd, 1)] if mull and on else []   # glazing bars
                if blink:   # the glazing bars blink out with their pane
                    self.open("blink", style); self.fruns([(X, Y, Wd, Hd)], lit)
                    if cross:
                        self.fruns(cross, mull)
                    self.close()
                else:
                    panes[lit if on else dark].append((X, Y, Wd, Hd)); bars += cross
                if sill:
                    sills.append((X - 1, Y + Hd, Wd + 2, 1))
        for c, rects in panes.items():
            self.fruns(rects, c)
        if bars:
            self.fruns(bars, mull)
        if sills:
            self.fruns(sills, sill)

    def lantern(self, cx, top, w, h, frame, light, glow=7):   # glass box with a glow, side frames, a base plate and a little roof
        self.open("flick")
        self.disc(cx, top + h / 2 - 0.5, glow, self.dither(None, light, 1)); self.disc(cx, top + h / 2 - 0.5, glow * 0.6, self.dither(None, light))
        self.close()
        self.rect(cx - w / 2, top, w, h, light); self.rect(cx - w / 2 + 2 * P, top + 2 * P, P, h - 4 * P, mix(light, "#ffffff", 0.65))
        self.runs([(cx - w / 2 - P, top, P, h), (cx + w / 2, top, P, h), (cx - w / 2 - 2 * P, top + h, w + 4 * P, 2 * P)], frame)
        self.shape(union(poly([(cx - w / 2 - 1, top + P), (cx + w / 2 + 1, top + P), (cx + w / 4, top - 2), (cx - w / 4, top - 2)]), box(cx - P, top - 3, 2 * P, 1)), frame)

    def lamp(self, x, base, post="#2a2438", light="#ffc45a"):   # a harbour lamp: thin pole, little lantern, two step glow
        cx = x + 1
        self.shape(union(box(cx - 2 * P, base - 29.67, 4 * P, 29.67), poly([(cx - 1.7, base), (cx + 1.7, base), (cx + 0.7, base - 2.3), (cx - 0.7, base - 2.3)]),
                         box(cx - 1, base - 27.3, 2, 1)), post)
        self.rect(cx - 2 * P, base - 26, P, 22, mix(post, light, 0.25))
        self.lantern(cx, base - 36, 3.33, 6, post, light)

    def rope(self, f, x0, x1, c, t=1, dark=None):   # a line y = f(x) in art units, t fine pixels thick; dark marks every third pixel
        cols, twist = [], []
        prev = None
        for X in range(fx(x0), fx(x1)):
            Y = math.floor(f((X + 0.5) / S) * S)
            top, bot = Y, Y + t
            if prev is not None and Y > prev + 1:
                top = prev + 1
            if prev is not None and Y < prev - 1:
                bot = prev
            cols.append((X, top, 1, bot - top))
            if dark and X % 3 == 0:
                twist.append((X, Y + t - 1, 1, 1))
            prev = Y
        runs, cur = [], None
        for X, top, w, h in cols:
            if cur and cur[1] == top and cur[3] == h and cur[0] + cur[2] == X:
                cur[2] += 1
            else:
                cur = [X, top, 1, h]; runs.append(cur)
        self.fruns([tuple(r) for r in runs], c)
        if twist:
            self.fruns(twist, dark)

    def string(self, f, y0, y1, c, cls="", style=""):   # a 1 fine pixel vertical line x = f(y)
        self.fruns([(math.floor(f((Y + 0.5) / S) * S), Y, 1, 1) for Y in range(fx(y0), fx(y1))], c, cls, style)

    def bunting(self, x1, y1, x2, y2, sag, colors):
        n = int(abs(x2 - x1) / 7)
        f = lambda x: y1 + (y2 - y1) * ((x - x1) / (x2 - x1)) + sag * 4 * ((x - x1) / (x2 - x1)) * (1 - (x - x1) / (x2 - x1))
        self.open("sway")
        self.rope(f, min(x1, x2), max(x1, x2), "#3a2a48")
        for i in range(n):
            x = round(x1 + (x2 - x1) * i / max(1, n))
            self.shape(poly([(x, f(x) + P), (x + 5, f(x + 5) + P), (x + 2.5, (f(x) + f(x + 5)) / 2 + 3.6)]), colors[i % len(colors)])
        self.close()

    def save(self, name):
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W * S} {H * S}" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges">'
               f'<defs>{"".join(self.pats.values())}</defs><style>{CSS}</style>{"".join(self.out)}</svg>')
        os.makedirs(OUT, exist_ok=True)
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write(svg)
        print(name, len(svg) // 1024, "KB")


def sprite(rows, X, Y, ch):   # fine pixel runs of one character in a little ascii drawing
    out = []
    for j, row in enumerate(rows):
        k = 0
        while k < len(row):
            if row[k] == ch:
                e = k
                while e < len(row) and row[e] == ch:
                    e += 1
                out.append((X + k, Y + j, e - k, 1)); k = e
            else:
                k += 1
    return out


# a cat sitting on the ridge, seen from the front (# body, e eyes), and its tail
CAT = ["....#..........#....",
       "....##........##....",
       "...####......####...",
       "...##############...",
       "..################..",
       ".#####ee####ee#####.",
       ".#####ee####ee#####.",
       ".##################.",
       "..################..",
       "...##############...",
       ".....##########.....",
       "......########......",
       ".....##########.....",
       "....############....",
       "....############....",
       "...##############...",
       "...##############...",
       "..################..",
       "..################..",
       "..################..",
       ".##################.",
       ".##################.",
       ".##################.",
       "####################",
       "####################",
       "########.##.########"]
CAT_TAIL = ["....##", "....##", "...##.", "...##.", "..##..", "..##..", "..##..", "..##..", ".##...", ".##...", "##....", "##....", "#....."]


def glint(s, x, y, w, c, cls="spark", style=""):   # a short water highlight with soft ends
    X, Y, Wd = fx(x), fx(y), fx(x + w) - fx(x)
    s.fruns([(X + 1, Y, Wd - 2, 1), (X, Y + 1, Wd, 1)], c, cls, style)


def dock():   # lobby: the ferry dock at sunset, where everyone arrives
    s = Scene(1)
    s.sky([("#2a1a5a", 30), ("#4f2575", 58), ("#93407f", 80), ("#d8607a", 96), ("#ff9a76", 106), ("#ffc48a", 113)])
    s.stars(26, 40)
    for x, y, w, d in [(10, 40, 46, 10), (200, 30, 60, 70), (120, 62, 38, 30), (260, 70, 50, 100)]:
        s.cloud(x, y, w, "#ff9ab0", "#c45a8a", delay=d)
    s.disc(160, 113, 30, s.dither(None, "#ffb07a", 1)); s.disc(160, 113, 27, s.dither(None, "#ffb07a"))
    s.disc(160, 113, 24, "#ffe08a")
    s.fruns([(390, 300, 180, 1), (390, 310, 180, 2), (390, 320, 180, 3), (390, 330, 180, 4)], "#ff9a76")   # sunset stripes, thin to thick
    s.sky([("#5a2f78", 124), ("#432470", 140), ("#2e1b58", 160), ("#22164a", 180)], 113)
    for i, (w, y) in enumerate([(30, 116), (22, 120), (34, 125), (16, 130), (26, 136), (12, 143), (18, 150)]):
        glint(s, 160 - w // 2 + s.rng.randrange(-3, 4), y, w, "#ffcf8a", style=f"animation-delay:-{i * 0.3:.1f}s")
    for _ in range(30):
        glint(s, s.rng.randrange(W), s.rng.randrange(118, 150), s.rng.randrange(2, 6), "#7a4a9a", style=f"animation-delay:-{s.rng.random() * 2:.1f}s")
    s.open("drift slow", "animation-delay:-60s")   # a little sailboat
    s.shape(poly([(239.3, 104), (255, 104), (252.7, 107.7), (241.7, 107.7)]), "#2a1a40")
    s.rect(246, 90.7, 2 * P, 13.3, "#2a1a40")
    s.shape([(fy, fx(247), fx(247.4 + 5.6 * (((fy + 0.5) / S - 92) / 11) ** 0.6)) for fy in range(fx(92), fx(103.3))], "#fff1cf")
    s.shape(poly([(245.7, 94), (245.7, 103.3), (241, 103.3)]), "#ffcf8a")
    s.rect(246.67, 90.7, 1.67, 1, "#ff6b9a")
    s.close()
    bird = ["..##....##..", ".#..#..#..#.", "#....##....#"]   # a gull, wings up
    for i in range(3):
        s.open("drift", f"animation-delay:-{20 + i * 7}s")
        bx, by = 40 + i * 9, 50 + (i % 2) * 4
        s.fruns([(fx(bx) + 1 + k, fx(by) + j, 1, 1) for j, row in enumerate(bird) for k, ch in enumerate(row) if ch == "#"], "#2a1a40")
        s.close()
    # the pier: planks with staggered joints, nail heads, a little grain and a lit front edge
    s.rect(0, 152, W, 28, "#6b4326")
    planks = [(154.33, 158), (158.67, 165), (165.67, 172), (172.67, 180)]
    for y in (158, 165, 172):
        s.rect(0, y, W, 2 * P, "#4e2f1a")
    grain, joints, nails = [], [], []
    for r, (y0, y1) in enumerate(planks):
        for _ in range(9):
            gx, gy = s.fine.uniform(0, W), s.fine.uniform(y0 + 1, y1 - 1)
            grain.append((gx, gy, s.fine.uniform(5, 16), P))
        for x in range(6 + (r % 2) * 11 - 22, W, 22):
            joints.append((x, y0, 2 * P, y1 - y0))
            nails += [(x - 1, y0 + 1, P, P), (x + 1.33, y0 + 1, P, P), (x - 1, y1 - 1.67, P, P), (x + 1.33, y1 - 1.67, P, P)]
    s.runs(grain, "#61391f"); s.runs(joints, "#4e2f1a"); s.runs(nails, "#3a2214")
    s.rect(0, 152, W, 2.33, "#8a5a34"); s.rect(0, 152, W, P, "#a8703f"); s.rect(0, 154.33, W, P, "#4e2f1a")
    for x in range(0, W, 40):   # mooring posts with ropes slung post to post
        s.shape(union(box(x + 18, 140.67, 3, 11.33), box(x + 18.33, 140, 2.33, 1)), "#3a2214")
        s.rect(x + 18.33, 141, P, 11, "#5a3820")
        s.rope(lambda u, x=x: 141.7 + 3.5 * math.sin(math.pi * (u - x - 21) / 37), x + 21, x + 58, "#c9a46a", 2, "#8a6a3a")
    for x in (48, 270):
        s.lamp(x, 152)
    for x, c in [(14, "#8a5a34"), (290, "#7a4a2a"), (300, "#8a5a34")]:   # crates
        s.rect(x, 140, 12, 12, c)
        s.runs([(x, 140, 12, 2 * P), (x, 151.33, 12, 2 * P), (x, 140, 2 * P, 12), (x + 11.33, 140, 2 * P, 12), (x, 144, 12, P), (x, 148, 12, P)], "#4e2f1a")
        s.rect(x + 0.67, 140.67, 10.67, P, mix(c, "#ffffff", 0.2))
        s.runs([(x + 1, 141, P, P), (x + 10.67, 141, P, P), (x + 1, 150.67, P, P), (x + 10.67, 150.67, P, P)], "#c9a46a")
    s.save("dock.svg")


def rooftops():   # night A: moonlit rooftops
    s = Scene(2)
    s.sky([("#070620", 40), ("#100c34", 80), ("#1e1750", 112), ("#33266a", 180)])
    s.stars(90, 115)
    s.open("shoot")   # a falling star, bright head and a fading tail
    for c, k0, k1 in [("#fff1cf", 0, 7), ("#cfc5ec", 7, 15), ("#6a5aa0", 15, 24)]:
        s.fruns([(750 + k, 61 - k // 2, 1, 1) for k in range(k0, k1)], c)
    s.fruns([(749, 61, 2, 2)], "#fff1cf")
    s.close()
    s.disc(262, 40, 34, s.dither(None, "#2e2770", 1)); s.disc(262, 40, 31, s.dither(None, "#2e2770"))
    s.disc(262, 40, 27, s.dither(None, "#4a3f8a", 1)); s.disc(262, 40, 24, s.dither(None, "#4a3f8a"))
    moon = ell(262, 40.5, 21.5, 21.5)
    s.shape(moon, "#fff1cf")
    s.shape(minus(moon, ell(264.5, 37.5, 21.5, 21.5)), s.dither(None, "#efdcb0"))   # a soft shadow on the lower left
    for cx, cy, r in [(255, 34, 4), (269, 46, 3), (268, 32, 2), (252, 48, 2)]:
        crater = ell(cx, cy + 0.5, r + 0.5, r + 0.5)
        s.shape(crater, "#efdcb0"); s.shape(minus(crater, shift(crater, 1, 1)), "#e2cc9c")
    x = -6
    while x < W:   # far rooftops
        w, h = s.rng.randrange(20, 34), s.rng.randrange(40, 66)
        s.rect(x, H - h, w, h, "#1d1650"); s.roof(x - 2, w + 4, H - h, "#1d1650", rim="#262062")
        s.windows(x + 4, H - h + 6, max(1, (w - 6) // 6), 3, "#6a5aa0", "#241c5a", gap=6, p=0.3)
        x += w + s.rng.randrange(0, 5)
    x = -4
    for i, w in enumerate([30, 36, 28, 44, 34, 30, 40, 38, 30, 32]):   # near rooftops
        h = [34, 44, 30, 52, 38, 30, 48, 36, 42, 30][i]
        s.rect(x, H - h, w, h, "#0e0b24")
        top = s.roof(x - 3, w + 6, H - h, "#0e0b24", steep=2 if i % 2 else 1, rim="#1d1748")
        s.rect(x - 3, H - h, w + 6, P, "#1d1748")   # eave edge
        s.windows(x + 5, H - h + 8, max(1, (w - 8) // 7), 3, "#ffc45a", "#1c1640", gap=7, size=(3, 4), p=0.5, mull="#c98a2a")
        if i in (1, 6, 8):
            cx = x + w - 9
            s.rect(cx, H - h - 10, 5, 10, "#0e0b24"); s.rect(cx - 2 * P, H - h - 10, 5 + 4 * P, 1.33, "#0e0b24")
            s.rect(cx + 5 - P, H - h - 9, P, 9, "#1d1748")
            for k in range(3):
                s.shape(union(ell(cx + 2, H - h - 12.5, 2.5, 2.2), ell(cx + 3.3, H - h - 13.6, 1.7, 1.6)), "#4a3f8a", "smoke", f"animation-delay:-{k * 1.6:.1f}s")
        if i == 3:   # a cat on the tallest roof, tail flicking
            cx, cy = x + w // 2 - 3, top + 1
            X, Y = fx(cx + 3.5) - 10, fx(cy) - len(CAT)
            s.fruns(sprite(CAT, X, Y, "#") + sprite(CAT, X, Y, "e"), "#0e0b24")
            s.fruns(sprite(CAT, X, Y, "e"), "#ffe14a", cls="eyes")
            s.fruns(sprite(CAT_TAIL, X + 18, Y + 9, "#"), "#0e0b24", cls="sway")
        x += w + 2
    s.save("rooftops.svg")


def woods():   # night B: the whispering woods
    s = Scene(3)
    s.sky([("#05070f", 35), ("#0b1028", 72), ("#161a40", 110), ("#231f4e", 180)])
    s.stars(50, 90, ("#e8f0ff", "#a7c4ff"))
    s.disc(58, 38, 26, s.dither(None, "#1c2a5a", 1)); s.disc(58, 38, 21, s.dither(None, "#1c2a5a"))
    s.shape(minus(ell(58, 38.5, 16.5, 16.5), ell(65, 33.5, 14.5, 14.5)), "#e8f0ff")   # crescent cut so the halo shows through
    for i in range(14):
        s.pine(i * 26 - 6 + s.rng.randrange(-4, 5), 160, s.rng.randrange(52, 84), "#121636")
    for k, y in enumerate((126, 138)):   # fog banks: overlapping wisps, thin at the edges and denser in the core
        s.open("drift slow", f"animation-delay:-{k * 90}s")
        for fx0, dy, fw in [(-120, 0, 160), (30, -1.67, 130), (150, 0.67, 150), (290, -1, 150)]:
            s.shape(rrect(fx0, y + dy, fw, 6, 3), s.dither(None, "#5a5f9a", 1))
            s.shape(rrect(fx0 + 10, y + dy + 1.67, fw - 20, 2.67, 1.33), s.dither(None, "#5a5f9a"))
        for fx0, dy, fw in [(-80, 0, 120), (60, 0.67, 150), (230, -0.33, 110)]:
            s.shape(rrect(fx0, y + 6 + dy, fw, 3.33, 1.67), s.dither(None, "#3e4378", 1))
            s.shape(rrect(fx0 + 8, y + 6.67 + dy, fw - 16, 2, 1), s.dither(None, "#3e4378"))
        s.close()
    s.rect(0, 156, W, 24, "#0c0f26")
    s.shape(poly([(133, 156), (187, 156), (223, 180), (97, 180)]), "#1b1f40")
    stones = []
    for x in (40, 72, 248, 280):   # rounded headstones
        stones.append(union(box(x, 148.5, 8, 7.5), ell(x + 4, 149, 4, 4)))
    for st in stones:
        s.shape(st, "#2a2f58"); s.shape(minus(st, shift(st, 2, 2)), "#3a4078")
    for x in (40, 72, 248, 280):
        s.runs([(x + 3.33, 148.33, 4 * P, 5), (x + 2.33, 149.33, 3 + P, 4 * P)], "#151935")
        s.runs([(x - 0.67, 155.33, 1.33, 2 * P), (x + 7.33, 155.67, 1, P), (x + 5, 155.33, P, 2 * P)], "#1b2448")   # grass at the foot
    for x in (110, 206):   # glowing lanterns on posts
        s.shape(union(box(x + 2 - 2 * P, 141, 4 * P, 15), poly([(x - 0.3, 156), (x + 4.3, 156), (x + 2.8, 153.7), (x + 1.2, 153.7)])), "#2a2f58")
        s.lantern(x + 2, 136.33, 4.67, 4.67, "#2a2f58", "#d8ff8a", glow=7)
    for side in (-1, 1):
        for k in range(3):
            s.pine(160 + side * (128 + k * 18), 180, 110 - k * 12, "#06081a")
    for _ in range(16):
        X, Y = fx(s.rng.randrange(30, 290)), fx(s.rng.randrange(100, 160))
        s.fruns([(X - 1, Y, 4, 2), (X, Y - 1, 2, 4)], "#d8ff7a", cls="ff", style=f"animation-delay:-{s.rng.random() * 5:.1f}s")
    for x, y, d in [(26, 120, 0), (290, 112, 4), (60, 104, 7)]:
        X, Y = fx(x), fx(y)
        s.fruns([(X, Y, 3, 1), (X + 1, Y + 1, 2, 1), (X + 8, Y, 3, 1), (X + 8, Y + 1, 2, 1)], "#ffe14a", cls="eyes", style=f"animation-delay:-{d}s")
    s.save("woods.svg")


def house(s, x, w, h, wall, roofc, base=158):
    s.rect(x, base - h, w, h, wall)
    s.rect(x + w - 2 * P, base - h, 2 * P, h, mix(wall, "#000000", 0.08))
    s.roof(x - 3, w + 6, base - h, roofc, tiles=mix(roofc, "#000000", 0.18))
    s.rect(x - 3, base - h, w + 6, P, mix(roofc, "#000000", 0.3))
    cols = max(1, (w - 6) // 8)
    s.windows(x + 4, base - h + 6, cols, max(1, (h - 16) // 9), "#3a4a8a", "#3a4a8a", gap=8, size=(4, 5), p=1, mull="#fff6e6", sill="#fff6e6")
    dx = x + w // 2 - 3
    s.shape(union(box(dx, base - 8, 6, 8), ell(dx + 3, base - 7.8, 3, 2.3)), "#6b4326")
    s.rect(dx + 3 - P / 2, base - 9, P, 9, "#5a3820"); s.runs([(dx + 1.67, base - 4.33, 2 * P, 2 * P), (dx + 3.67, base - 4.33, 2 * P, 2 * P)], "#ffc45a")


def square():   # day A: the town square with the clock tower
    s = Scene(4)
    s.sky([("#2558c0", 40), ("#3a74d8", 78), ("#5c96e6", 110), ("#86b8ef", 180)])
    s.disc(52, 34, 22, s.dither(None, "#9cc4f5", 1)); s.disc(52, 34, 18, s.dither(None, "#9cc4f5")); s.disc(52, 34, 13, "#fff1a8")
    for x, y, w, d in [(0, 30, 50, 0), (90, 16, 64, 40), (210, 40, 46, 80), (270, 18, 56, 110), (150, 56, 36, 20)]:
        s.cloud(x, y, w, "#f2f8ff", "#bcd4f2", delay=d)
    s.open("bob")   # the hot air balloon, gores following the curve
    env = union(ell(262, 52.5, 11.5, 11.5), poly([(251.6, 56), (272.4, 56), (265.6, 63.7), (258.4, 63.7)]))
    s.shape(env, "#ff6b9a")
    C = 262 * S
    for lo, hi in [(-0.62, -0.3), (0.3, 0.62)]:
        s.shape([(y, round(C + lo * (b - a) / 2), round(C + hi * (b - a) / 2)) for y, a, b in env], "#ffe14a")
    s.shape([(y, a, a + 2) for y, a, b in env if b - a > 8], mix("#ff6b9a", "#ffffff", 0.35))
    s.runs([(258.33, 63.67, P, 3), (265.33, 63.67, P, 3)], "#5e3b1f")
    s.shape(rrect(259, 66.33, 6, 3.67, 0.7), "#8a5a34"); s.rect(259, 67.33, 6, P, "#5e3b1f")
    s.close()
    for x, w, h, wall, r in [(2, 34, 46, "#ff9db5", "#c8406a"), (40, 36, 54, "#ffd97a", "#d88a3a"), (80, 34, 44, "#a5ecb0", "#3e9a6a"),
                             (206, 34, 44, "#8fd6ff", "#3a6fd8"), (244, 36, 54, "#cdb4ff", "#7a4ac8"), (284, 34, 46, "#ffb98a", "#c86a3a")]:
        house(s, x, w, h, wall, r)
    # the town hall
    s.rect(122, 104, 76, 54, "#f2dcc0")
    s.roof(118, 84, 104, "#c84a5a", tiles="#a83a4a")
    s.rect(146, 54, 28, 50, "#ead0b0"); s.roof(143, 34, 54, "#c84a5a", tiles="#a83a4a")
    s.rect(143, 54, 34, P, "#8a2a3a"); s.rect(118, 104, 84, P, "#8a2a3a")
    s.disc(160, 72, 9, "#e8d0a0"); s.disc(160, 72, 7, "#fff1cf")
    ticks = []
    for k in range(12):
        a = k * math.pi / 6
        big = k % 3 == 0
        X, Y = round((160 + math.sin(a) * 6) * S), round((72.5 - math.cos(a) * 6) * S)
        ticks.append((X - 1, Y - 1, 2, 2) if big else (X, Y, 1, 1))
    s.fruns(ticks, "#8a7a6a")
    s.runs([(160 - P, 67.5, 2 * P, 5.33), (160, 72.17, 4, 2 * P)], "#2a2438"); s.rect(160 - 2 * P, 72.17 - P, 4 * P, 4 * P, "#c84a5a")
    for k in range(5):
        cx = 128 + k * 15
        s.rect(cx, 116, 4, 40, "#fff6e6"); s.rect(cx + 4 - 2 * P, 116, 2 * P, 40, "#ead0b0")
        s.runs([(cx - 0.67, 115, 5.33, 1.33), (cx - 0.67, 155, 5.33, 1)], "#e0c49c")
    s.shape(union(box(153, 136, 14, 22), ell(160, 136.3, 7, 4.5)), "#6b4326")
    s.rect(160 - P / 2, 132, P, 26, "#4e2f1a"); s.runs([(158, 146, 2 * P, 2 * P), (161.33, 146, 2 * P, 2 * P)], "#ffc45a")
    s.rect(126, 112, 68, 3, "#d8b890"); s.rect(126, 112, 68, P, "#fff6e6"); s.rect(126, 115 - P, 68, P, "#c0a078")
    s.bunting(160, 92, 20, 108, 6, ["#ff6b9a", "#ffe14a", "#6fe3cf", "#8f7bff"])
    s.bunting(160, 92, 300, 108, 6, ["#6fe3cf", "#ff6b9a", "#ffe14a", "#8f7bff"])
    s.pats["cob"] = ('<pattern id="cob" width="12" height="8" patternUnits="userSpaceOnUse"><rect width="12" height="8" fill="#c9a98a"/>'
                     '<path d="M0 3h12v1h-12zM0 7h12v1h-12zM5 0h1v3h-1zM11 0h1v3h-1zM2 4h1v3h-1zM8 4h1v3h-1z" fill="#b8957a"/>'
                     '<path d="M0 0h2v1h-2zM6 0h2v1h-2zM3 4h2v1h-2zM9 4h2v1h-2z" fill="#d6b898"/></pattern>')
    s.rect(0, 158, W, 22, "url(#cob)"); s.rect(0, 158, W, 2, "#a07a64"); s.rect(0, 160, W, P, "#b8957a")
    # the fountain: a stone bowl with a lit rim, a spout and dancing droplets
    s.shape(union(box(154.67, 170, 10.67, 8), rrect(150.67, 176.67, 18.67, 3.33, 1)), "#8a8aa8")   # pedestal and plinth
    s.runs([(164.67, 170, 2 * P, 6.67), (150.67, 176.67, 18.67, P)], "#76769a")
    bowl = clip(ell(160, 165.67, 14.33, 7), y0=165.67)
    s.shape(bowl, "#8a8aa8"); s.shape(minus(bowl, shift(bowl, -2, -2)), "#76769a")
    s.shape(ell(160, 165.3, 12.4, 1.6), "#6fc8f0"); s.rect(150.67, 164.33, 12, P, "#c4ecff")
    s.shape(rrect(145.33, 165, 29.33, 2.33, 1.1), "#a8a8c4"); s.rect(146.33, 167, 27.33, P, "#76769a")
    s.shape(union(box(158.67, 157, 2.67, 8), poly([(155.67, 156), (164.33, 156), (162.3, 157.7), (157.7, 157.7)])), "#8a8aa8")
    s.rect(158.67, 157.67, P, 7, "#a8a8c4"); s.rect(155.67, 156, 8.67, P, "#a8a8c4")
    for side in (-1, 1):   # water falling from the top bowl into the basin
        s.rope(lambda u, side=side: 155.5 + 0.17 * ((u - 160) * side - 4) ** 2 if (u - 160) * side > 4 else 155.5, 160 + (4 if side > 0 else -11.5), 160 + (11.5 if side > 0 else -4), "#c4ecff")
    for i in range(6):
        s.runs([(150 + i * 4, 162 - (i % 2) * 3, 2 * P, 2), (150 + i * 4 + P / 2, 161.33 - (i % 2) * 3, P, P)], "#c4ecff", cls="spark", style=f"animation-delay:-{i * 0.4:.1f}s")
    for x in (64, 250):   # pigeons
        s.open("sway")
        s.shape(union(ell(x + 2.5, 171.6, 3.2, 1.7), poly([(x - 1.6, 170.3), (x + 0.6, 170.8), (x + 0.6, 172.3), (x - 1.6, 171.2)]), ell(x + 5, 169.3, 1.3, 1.3), poly([(x + 3.8, 169.6), (x + 5.8, 169.6), (x + 5.3, 171.6), (x + 3.4, 171.6)])), "#8a8aa8")
        s.shape(ell(x + 2, 171.4, 1.9, 0.9), "#6e6e90"); s.rect(x + 4.33, 170.33, 1.67, 2 * P, "#7ab4c4")
        s.rect(x + 5.33, 168.67, P, P, "#2a2438"); s.rect(x + 6.33, 169.33, 2 * P, P, "#ffb98a")
        s.runs([(x + 2, 173.33, P, 1), (x + 3, 173.33, P, 1)], "#ff8a8a")
        s.close()
    s.save("square.svg")


def market():   # day B: the market under the windmill hills
    s = Scene(5)
    s.sky([("#2f66c8", 36), ("#4e88dc", 70), ("#7fb0ea", 96), ("#f2c49a", 122)])   # down to the meadow, no gap between the hills
    for x, y, w, d in [(30, 24, 52, 30), (180, 14, 60, 90), (120, 44, 40, 150)]:
        s.cloud(x, y, w, "#f6f8ff", "#c2d6f2", delay=d)
    s.disc(80, 150, 60, "#5aa07a"); s.disc(250, 152, 64, "#4a8a6a")
    for bx, by, r, c in [(52, 100, 2.2, "#4a8a6a"), (66, 94.5, 1.8, "#4a8a6a"), (100, 96, 2, "#4a8a6a"), (214, 101, 2, "#3e7a5a"), (232, 95, 2.4, "#3e7a5a"), (282, 97, 2, "#3e7a5a")]:
        blob = union(ell(bx, by, r, r * 0.9), ell(bx - r * 0.8, by + r * 0.5, r * 0.7, r * 0.6), ell(bx + r * 0.8, by + r * 0.5, r * 0.7, r * 0.6))
        s.shape(blob, c); s.shape(minus(blob, shift(blob, 1, 1)), "#6ab88a")
    s.rect(0, 122, W, 58, "#4a8a6a")
    s.shape(poly([(248.5, 86), (253.5, 86), (255, 110), (247, 110)]), "#f2dcc0")   # windmill tower
    s.rect(253.5 - P, 86, P, 24, "#d8bc9c")
    s.shape(union(box(250, 106.5, 2, 3.5), ell(251, 106.6, 1, 0.8)), "#8a5a34"); s.rect(250.33, 96, 4 * P, 4 * P, "#3a4a8a")
    s.roof(246, 10, 86, "#c84a5a")
    s.open("spin")   # four lattice sails around the hub
    for q in range(4):
        s.open(tf=f"rotate({q * 90} 753 252)")
        s.fruns([(757, 251, 46, 2)], "#fff1cf")
        s.fruns([(765, 253, 37, 9)], s.dither(None, "#fff1cf"))
        s.fruns([(765, 253, 37, 1), (765, 261, 37, 1), (765, 253, 1, 9), (801, 253, 1, 9)] + [(765 + k * 6, 253, 1, 9) for k in range(1, 6)], "#f2dcc0")
        s.close()
    s.shape(ell(251, 84, 1.7, 1.7), "#c84a5a")
    s.close()
    s.rect(0, 148, W, 32, "#d8b48a"); s.rect(0, 148, W, 32, s.dither(None, "#c49a74")); s.rect(0, 148, W, 2, "#a8805a"); s.rect(0, 150, W, P, "#c49a74")
    for c, x in [("#e8384f", 10), ("#3fb8a8", 88), ("#ffcf3f", 166), ("#8f5bff", 244)]:
        w = 66
        s.runs([(x + 3, 112, 2, 38), (x + w - 5, 112, 2, 38)], "#6b4326"); s.runs([(x + 3, 112, P, 38), (x + w - 5, 112, P, 38)], "#8a5a34")
        for k in range(0, w, 6):
            col = c if (k // 6) % 2 == 0 else "#fff6e6"
            s.shape(union(box(x + k, 104, 6, 10), clip(ell(x + k + 3, 114, 3, 3), y0=114)), col)
        s.rect(x, 104, w, 1, mix(c, "#000000", 0.25)); s.rect(x, 113, w, P, mix(c, "#000000", 0.12))
        s.rect(x, 132, w, 16, "#8a5a34"); s.rect(x, 132, w, 2, "#a8703f"); s.rect(x, 132, w, P, "#c98a4a")
        s.runs([(x, 137 + k * 4, w, P) for k in range(3)], "#6b4326")
        fruit, shine = [], []
        for k in range(9):
            fc = ["#ff6b6b", "#ffcf3f", "#a5ecb0", "#ff9a3c", "#cdb4ff"][(k + x) % 5]
            cx = x + 6 + k * 7
            s.disc(cx, 129, 3, fc); s.shape(minus(ell(cx, 129.5, 3.5, 3.5), ell(cx - 0.67, 128.83, 3.5, 3.5)), mix(fc, "#000000", 0.2))
            shine.append((cx - 1.67, 127.33, 2 * P, 2 * P))
            if k % 2:
                s.rect(cx - P / 2, 125.33, P, 1, "#3e7a5a"); s.rect(cx, 125.33, 1, P, "#5aa07a")
        s.runs(shine, "#fff6e6")
    s.bunting(0, 92, 160, 92, 8, ["#ff6b9a", "#ffe14a", "#6fe3cf"]); s.bunting(160, 92, 320, 92, 8, ["#6fe3cf", "#ffe14a", "#ff6b9a"])
    for i, (x, c) in enumerate([(84, "#ff6b9a"), (90, "#6fe3cf"), (232, "#ffe14a"), (238, "#8f7bff")]):
        s.open("bob", f"animation-delay:-{i * 1.5}s")
        cy = 70 + (i % 2) * 6
        s.shape(ell(x, cy + 0.3, 4.7, 5.6), c)
        s.shape(minus(ell(x, cy + 0.3, 4.7, 5.6), ell(x - 0.67, cy - 0.37, 4.7, 5.6)), mix(c, "#000000", 0.15))
        s.shape(ell(x - 1.7, cy - 2, 0.8, 1.3), mix(c, "#ffffff", 0.6))
        s.shape(poly([(x - 0.8, cy + 6.9), (x + 0.8, cy + 6.9), (x, cy + 5.6)]), c)
        s.string(lambda y, x=x, cy=cy: x + 0.5 * math.sin((y - cy) * 0.5), cy + 6.9, cy + 32, "#fff6e6")
        s.close()
    s.save("market.svg")


def finale():   # the end: dawn breaks with fireworks
    s = Scene(6)
    s.sky([("#1a1240", 40), ("#3a1f6a", 76), ("#7a347e", 104), ("#d85a7a", 126), ("#ffae76", 180)])
    s.stars(30, 60)
    for i, (cx, cy, c, r) in enumerate([(70, 46, "#ffe14a", 18), (160, 30, "#ff6b9a", 22), (250, 50, "#6fe3cf", 18), (115, 76, "#cdb4ff", 14), (210, 82, "#ffb98a", 14)]):
        trail, tips = set(), []
        for k in range(16):   # sixteen streaks, long and short in turn, dotted near the heart and solid toward a bright tip
            a, long = k * math.pi / 8, k % 2 == 0
            r0, r1 = (0.32 if long else 0.45) * r, (1 if long else 0.78) * r
            n = round((r1 - r0) * S)
            for j in range(n):
                rr = r0 + (r1 - r0) * j / n
                if rr > 0.62 * r or j % 2 == 0:
                    trail.add((round((cx + math.cos(a) * rr) * S), round((cy + math.sin(a) * rr) * S), 1, 1))
            X, Y = round((cx + math.cos(a) * r1) * S), round((cy + math.sin(a) * r1) * S)
            tips += [(X - 1, Y, 3, 1), (X, Y - 1, 1, 3)] if long else [(X, Y, 2, 2)]
        s.open("fw", f"animation-delay:-{i * 0.65:.2f}s")
        s.fruns(list(trail), c); s.fruns(tips, mix(c, "#ffffff", 0.55))
        s.close()
    x = -4
    for _ in range(12):
        w, h = s.rng.randrange(22, 34), s.rng.randrange(26, 50)
        s.rect(x, H - h, w, h, "#1c1330"); s.roof(x - 2, w + 4, H - h, "#1c1330", rim="#3a2448")
        s.windows(x + 4, H - h + 6, max(1, (w - 6) // 7), 2, "#ffc45a", "#2a1f44", gap=7, size=(3, 4), p=0.6, mull="#c98a2a")
        x += w + 2
    for _ in range(36):
        X, Y = fx(s.rng.randrange(W)), fx(s.rng.randrange(-20, 60))
        w, h = s.fine.choice([(4, 2), (2, 4), (3, 3), (5, 2)])
        s.fruns([(X, Y, w, h)], s.rng.choice(["#ffe14a", "#ff6b9a", "#6fe3cf", "#fff1cf"]), cls="fall", style=f"animation-delay:-{s.rng.random() * 7:.1f}s")
    s.save("finale.svg")


def hat(s, hx, y, c, kind):
    hi, lo = mix(c, "#ffffff", 0.35), mix(c, "#000000", 0.25)
    if kind:   # a bowler: round crown on a curled brim
        crown = clip(ell(hx + 5, y - 1.8, 3.4, 4.2), y1=y - 1.5)
        s.shape(crown, c); s.shape(rrect(hx, y - 2, 10, 2, 1), c)
        s.shape([(fy, a + 1, a + 2) for fy, a, b in crown if b - a > 6], hi)
        s.rect(hx + 1.7, y - 3, 6.6, 2 * P, lo); s.rect(hx + 0.67, y - P, 8.67, P, lo)
    else:   # a top hat with a band
        s.shape(union(poly([(hx + 0.7, y - 10), (hx + 9.3, y - 10), (hx + 8.7, y - 1.5), (hx + 1.3, y - 1.5)]), rrect(hx - 0.3, y - 1.7, 10.6, 1.7, 0.8)), c)
        s.rect(hx + 1.33, y - 5.67, 7.33, 1, "#1c1330"); s.rect(hx + 1.67, y - 9.33, P, 3, hi); s.rect(hx + 0.67, y - 10, 8.67, P, hi)


def shirt(s, hx, c):
    s.rect(hx + 4.67, 101.67, P, 1.67, "#cfc5ec")
    s.rope(lambda u: 105.3 - 1.7 * (1 - abs(u - hx - 5) / 4.3), hx + 0.7, hx + 9.3, "#cfc5ec")
    body = union(box(hx + 1.33, 105.67, 7.33, 11.33), poly([(hx + 1.7, 105.33), (hx + 3.3, 105.33), (hx + 2.7, 109.7), (hx - 0.4, 108.7)]),
                 poly([(hx + 6.7, 105.33), (hx + 8.3, 105.33), (hx + 10.4, 108.7), (hx + 7.3, 109.7)]), box(hx + 2.33, 105.33, 5.33, 1))
    s.shape(body, c)
    s.shape(poly([(hx + 3.3, 105.33), (hx + 6.7, 105.33), (hx + 5, 107.7)]), "#ffffff")
    s.runs([(hx + 1.33, 116.67, 7.33, P), (hx + 7.33, 109, P, 7.67)], mix(c, "#000000", 0.15))


def boutique():   # the wardrobe: a tiny velvet boutique
    s = Scene(7)
    for x in range(0, W, 12):
        s.rect(x, 0, 6, 140, "#3a2a6a"); s.rect(x + 6, 0, 6, 140, "#33255e")
    s.runs([(x + 3 - P / 2, 0, P, 117) for x in range(0, W, 12)], "#413274")
    s.rect(0, 118, W, 22, "#261c4e"); s.rect(0, 117, W, 2, "#ffc45a"); s.rect(0, 118.67, W, P, "#c98a2a")
    for y in (52, 84):
        for x0 in (46, 214):
            s.rect(x0, y, 60, 3, "#8a5a34"); s.rect(x0, y, 60, P, "#a8703f"); s.rect(x0, y + 3, 60, P, "#1c1330")
            s.shape(union(poly([(x0 + 3, y + 3), (x0 + 6, y + 3), (x0 + 3, y + 6)]), poly([(x0 + 54, y + 3), (x0 + 57, y + 3), (x0 + 57, y + 6)])), "#6b4326")
            for k, c in enumerate(["#e8384f", "#3fb8a8", "#ffcf3f", "#cdb4ff"]):
                hat(s, x0 + 4 + k * 14, y, c, (k + y) % 2)
    s.rect(60, 100, 200, 2, "#cfc5ec"); s.rect(60, 100, 200, P, "#fff6e6"); s.rect(60, 102 - P, 200, P, "#9a8fc0")
    for k, c in enumerate(["#ff9db5", "#8fd6ff", "#ffd97a", "#a5ecb0", "#cdb4ff", "#ffb98a", "#8fe8d8", "#f3a0f7", "#ff6b6b", "#6f8dff"]):
        hx = 66 + k * 19
        if 112 < hx < 196:
            continue
        shirt(s, hx, c)
    s.rect(0, 140, W, 40, "#4a2f6a")
    s.runs([(x, y, 8, 8) for y in range(140, 180, 8) for x in range((y // 8) % 2 * 8, W, 16)], "#3a2458")
    # the half round rug: a dithered fringe around a solid body with a pink ring, the checker floor showing below it
    s.disc(160, 168, 40, s.dither(None, "#ff6b9a", 1), half=True); s.disc(160, 168, 38.33, s.dither(None, "#ff6b9a"), half=True)
    s.disc(160, 168, 36.67, mix("#4a2f6a", "#ff6b9a", 0.55), half=True)
    s.shape(clip(minus(ell(160, 168.5, 33.5, 33.5), ell(160, 168.5, 33.17, 33.17)), y1=169), "#ff6b9a")
    s.shape(clip(minus(ell(160, 168.5, 32.5, 32.5), ell(160, 168.5, 32.17, 32.17)), y1=169), mix("#4a2f6a", "#ff6b9a", 0.75))
    for side in (0, 1):
        x0 = 0 if side == 0 else 282
        s.rect(x0, 0, 38, 180, "#a8304f")
        s.runs([(x0 + k - P, 0, P, 180) for k in range(3, 38, 6)] + [(x0 + k + 2, 0, P, 180) for k in range(3, 38, 6)], "#922844")
        s.runs([(x0 + k, 0, 2, 180) for k in range(3, 38, 6)], "#7a1f3a")
        s.runs([(x0 + k + 3.67, 0, P, 180) for k in range(3, 38, 6)], "#c24a66")
        tx = x0 + (24 if side == 0 else 2)
        s.shape(rrect(tx, 92, 12, 4, 1.3), "#ffc45a"); s.rect(tx + 0.67, 92.67, 10.67, P, "#fff1cf"); s.rect(tx + 0.67, 95, 10.67, P, "#c98a2a")
        kx = tx + (1 if side == 0 else 9)
        s.shape(union(ell(kx + 1, 97.5, 1.2, 1.2), poly([(kx + 0.3, 98.3), (kx + 1.7, 98.3), (kx + 2.3, 102.3), (kx - 0.3, 102.3)])), "#ffc45a")
        s.runs([(kx - 0.33 + k * 2 * P, 101.67, P, 1) for k in range(4)], "#c98a2a")
    for x in range(0, W, 16):
        s.disc(x + 8, 10, 8, "#a8304f")
        s.shape(minus(ell(x + 8, 10.5, 8.5, 8.5), ell(x + 8, 9.5, 8.5, 8.5)), "#7a1f3a")
        s.shape(union(box(x + 7.33, 16, 4 * P, 2), ell(x + 8, 18.67, 1.33, 1.67)), "#ffc45a"); s.rect(x + 7.33, 18.67, P, 1.33, "#fff1cf")
    s.rect(0, 0, W, 6, "#7a1f3a"); s.rect(0, 6 - P, W, P, "#5a1428")
    pts = [(x, 26 + 8 * math.sin(math.pi * (x - 44) / 236)) for x in range(44, 280, 14)]
    s.rope(lambda u: 24 + 8 * math.sin(math.pi * (u - 44) / 236) + 0.6 * abs(math.sin(math.pi * (u - 44) / 14)), 30, 290, "#2a2438")
    for i, (x, y) in enumerate(pts):
        s.rect(x - P, y - 1.67, 3 * P, 1.33, "#2a2438")
        bc = ["#ffe14a", "#ff6b9a", "#6fe3cf", "#fff1cf"][i % 4]
        s.open("tw", f"animation-delay:-{i * 0.5:.1f}s")
        s.shape(ell(x + 0.5, y + 1.6, 1.5, 1.8), bc); s.rect(x - P / 2, y + 0.67, P, 2 * P, "#ffffff")
        s.close()
    s.save("boutique.svg")


def study():   # choosing the narrator: the storyteller's study, where the town clock keeps time
    s = Scene(8)
    for x in range(0, W, 16):
        s.rect(x, 0, 8, 112, "#2c2256"); s.rect(x + 8, 0, 8, 112, "#281e4e")
    s.runs([(x + 4 - P / 2, 0, P, 110) for x in range(0, W, 16)], "#30265c")
    s.rect(0, 112, W, 22, "#3d2548"); s.rect(0, 110, W, 3, "#6b4326"); s.rect(0, 110, W, P, "#8a5a34"); s.rect(0, 113, W, P, "#2c1a34")
    for x in range(4, W, 24):   # bevelled wainscot panels
        s.rect(x, 117, 16, 12, "#34203f")
        s.runs([(x, 117, 16, P), (x, 117, P, 12)], "#2a1834"); s.runs([(x, 129 - P, 16, P), (x + 16 - P, 117, P, 12)], "#4a2e56")
    s.rect(0, 134, W, 46, "#5a3820")
    for y in (134, 145, 157, 169):
        s.rect(0, y, W, 2 * P, "#3a2214"); s.rect(0, y + 2 * P, W, P, "#6b4326")
    rowsy = [(135, 145), (146, 157), (158, 169), (170, 180)]
    for i, x in enumerate(range(0, W, 26)):
        for r, (y0, y1) in enumerate(rowsy):
            s.rect(x + ((i + r) % 2) * 9 + (r % 2) * 13, y0, 2 * P, y1 - y0, "#4a2c18")
    s.disc(160, 172, 58, s.dither(None, "#a8304f", 1)); s.disc(160, 172, 55, s.dither(None, "#a8304f"))
    s.disc(160, 172, 47, "#a8304f"); s.shape(minus(ell(160, 172.5, 46, 46), ell(160, 172.5, 45.33, 45.33)), "#c98a2a")
    s.disc(160, 172, 44, s.dither("#a8304f", "#7a1f3a"))

    def shelf(x0, w, top):
        s.rect(x0 - 2, top - 3, w + 4, 110 - top + 3, "#3a2214"); s.rect(x0, top, w, 110 - top, "#1c1330")
        s.rect(x0 - 2, top - 3, w + 4, P, "#5a3820"); s.rect(x0 - 2, top - 3, P, 110 - top + 3, "#4e2f1a")
        books, bands, edges = {}, [], {}
        for y in range(top + 18, 110, 20):
            s.rect(x0, y, w, 2, "#6b4326"); s.rect(x0, y, w, P, "#8a5a34")
            x = x0 + 1
            while x < x0 + w - 3:
                bw, bh = s.rng.choice([2, 3, 3, 4]), s.rng.randrange(10, 16)
                if s.rng.random() < 0.85:
                    c = s.rng.choice(["#a8304f", "#3fb8a8", "#ffc45a", "#6f8dff", "#cdb4ff", "#ff9a76", "#5a4f9c"])
                    books.setdefault(c, []).append((x, y - bh, bw, bh))
                    edges.setdefault(mix(c, "#000000", 0.3), []).append((x + bw - P, y - bh, P, bh))
                    bands += [(x, y - bh + 1.67, bw, P), (x, y - bh + 2.67, bw, P), (x, y - 2, bw, P)]
                x += bw + 1
        for c, r in books.items():
            s.runs(r, c)
        for c, r in edges.items():
            s.runs(r, c)
        s.runs(bands, "#fff1cf")
    shelf(14, 48, 26); shelf(204, 44, 26)
    # the window, with the moon looking in
    s.rect(80, 30, 52, 66, "#6b4326"); s.rect(83, 33, 46, 60, "#100c34")
    s.rect(80, 30, 52, P, "#8a5a34"); s.rect(83, 33, 46, P, "#06041a")
    s.disc(114, 52, 9, s.dither(None, "#fff1cf", 1)); s.disc(114, 52, 7.5, s.dither(None, "#fff1cf")); s.disc(114, 52, 6, "#fff1cf")
    s.shape(minus(ell(114, 52.5, 6.5, 6.5), ell(115, 51.5, 6.5, 6.5)), "#efdcb0")
    for x, y in [(88, 40), (97, 58), (92, 76), (106, 84), (122, 72), (101, 44), (124, 38)]:
        X, Y = fx(x), fx(y)
        big = (x + y) % 3 == 0
        s.fruns([(X - 1, Y, 3, 1), (X, Y - 1, 1, 3)] if big else [(X, Y, 2, 2)], "#fff1cf", cls="tw", style=f"animation-delay:-{s.rng.random() * 4:.1f}s")
    s.rect(105, 33, 2, 60, "#6b4326"); s.rect(83, 62, 46, 2, "#6b4326"); s.rect(105, 33, P, 60, "#8a5a34"); s.rect(83, 62, 46, P, "#8a5a34")
    s.rect(78, 96, 56, 3, "#8a5a34"); s.rect(78, 96, 56, P, "#a8703f"); s.rect(78, 99, 56, P, "#3a2214")
    for x0 in (74, 128):
        s.rect(x0, 26, 10, 74, "#a8304f"); s.rect(x0 + 3, 26, 2, 74, "#7a1f3a"); s.rect(x0 + 7, 26, 1, 74, "#7a1f3a")
        s.runs([(x0 + 1, 26, P, 74), (x0 + 5.33, 26, P, 74), (x0 + 8.67, 26, P, 74)], "#c24a66")
        s.shape(ell(x0 + 5, 99.6, 5, 0.6), "#7a1f3a")
    s.rect(72, 24, 68, 3, "#ffc45a"); s.rect(72, 24, 68, P, "#fff1cf"); s.rect(72, 27 - P, 68, P, "#c98a2a")
    s.disc(71, 25, 2, "#ffc45a"); s.disc(141, 25, 2, "#ffc45a")
    # the grandfather clock in the middle of the room
    s.rect(144, 44, 32, 90, "#3a2214"); s.rect(146, 46, 28, 86, "#6b4326"); s.rect(146, 46, P, 86, "#8a5a34")
    s.roof(140, 40, 44, "#3a2214"); s.rect(140, 42, 40, 3, "#8a5a34"); s.rect(140, 42, 40, P, "#a8703f")
    s.disc(160, 23, 1.3, "#c98a2a")
    s.disc(160, 62, 11, "#3a2214"); s.disc(160, 62, 10, "#c98a2a"); s.disc(160, 62, 9, "#fff1cf")
    ticks = []
    for k in range(12):
        a = k * math.pi / 6
        X, Y = round((160 + math.sin(a) * 7.8) * S), round((62.5 - math.cos(a) * 7.8) * S)
        ticks.append((X - 1, Y - 1, 2, 2) if k % 3 == 0 else (X, Y, 1, 1))
    s.fruns(ticks, "#3a2214")
    s.runs([(160 - P, 56.33, 2 * P, 6.33)], "#1c1330"); s.runs([(160, 62.5 - P, 4.67, 2 * P)], "#a8304f"); s.rect(160 - 2 * P, 62.5 - 2 * P, 4 * P, 4 * P, "#1c1330")
    s.rect(150, 78, 20, 44, "#3a2214"); s.rect(152, 80, 16, 40, "#1c1330")
    s.runs([(153, 81 + k, P, P) for k in range(0, 6)] + [(154 + k * P, 81, P, P) for k in range(0, 6)], "#2c2448")   # glass glint
    s.open("tick")
    s.rect(160 - P, 80, 2 * P, 27, "#c98a2a"); s.disc(160, 110, 4, "#c98a2a"); s.disc(160, 110, 3.33, "#ffc45a")
    s.rect(158.33, 108.33, 2 * P, 2 * P, "#fff1cf")
    s.close()
    s.rect(142, 126, 36, 8, "#3a2214"); s.rect(144, 128, 32, 2, "#8a5a34"); s.rect(144, 128, 32, P, "#a8703f")
    # candles on the wall either side of the clock
    for x in (138, 182):
        s.shape(union(rrect(x - 2, 92, 5, 2, 0.7), poly([(x - 0.7, 94), (x + 1.7, 94), (x + 0.5, 96.5)])), "#c98a2a")
        s.rect(x - 1, 86, 3, 6, "#fff1cf"); s.rect(x + 2 - P, 86, P, 6, "#e8d8b0"); s.rect(x - 1, 87, P, 1.67, "#fff1cf")
        s.open("flick")
        s.disc(x + 0.5, 82, 6, s.dither(None, "#ffc45a", 1)); s.disc(x + 0.5, 82, 3.5, s.dither(None, "#ffc45a"))
        s.close()
        s.shape(union(ell(x + 0.5, 83.6, 1.3, 1.6), poly([(x - 0.6, 83.3), (x + 1.6, 83.3), (x + 0.5, 79.3)])), "#ffc45a")
        s.shape(ell(x + 0.5, 84, 0.6, 0.9), "#fff1cf", "flick")
        s.rect(x + 0.5 - P / 2, 85, P, 1, "#1c1330")
    # the narrator's desk and chair
    s.shape(union(box(262, 96, 30, 38), ell(277, 96.5, 15, 4.5)), "#7a1f3a")
    s.runs([(268 + k * 6, 100 + (k % 2) * 4, 2 * P, 2 * P) for k in range(4)], "#c98a2a")
    s.shape(rrect(258, 108, 38, 26, 1.3), "#a8304f"); s.runs([(258, 108, 4, 26), (292, 108, 4, 26)], "#7a1f3a"); s.rect(262, 108, 30, P, "#c24a66")
    s.rect(236, 116, 74, 4, "#8a5a34"); s.rect(236, 116, 74, P, "#a8703f"); s.rect(236, 120 - P, 74, P, "#6b4326")
    s.runs([(240, 120, 4, 26), (302, 120, 4, 26)], "#4e2f1a"); s.runs([(240, 120, P, 26), (302, 120, P, 26)], "#6b4326")
    s.shape(union(poly([(250, 112), (259, 112.67), (259, 116), (250, 116)]), poly([(260, 112.67), (269, 112), (269, 116), (260, 116)])), "#fff1cf")
    s.runs([(251.33, 113.33 + k, 6, P) for k in range(3)] + [(261.67, 113.33 + k, 6, P) for k in range(3)], "#cfc5ec")
    s.rect(259, 112, 1, 4, "#a8304f")
    s.rect(284, 106, 3, 10, "#fff1cf"); s.rect(287 - P, 106, P, 10, "#e8d8b0"); s.shape(rrect(282.67, 115, 5.67, 1, 0.4), "#c98a2a")
    s.open("flick")
    s.disc(285.5, 101, 6, s.dither(None, "#ffc45a", 1)); s.disc(285.5, 101, 3.5, s.dither(None, "#ffc45a"))
    s.close()
    s.shape(union(ell(285.5, 103, 1.2, 1.5), poly([(284.5, 102.7), (286.5, 102.7), (285.5, 99)])), "#ffc45a"); s.shape(ell(285.5, 103.4, 0.5, 0.8), "#fff1cf", "flick")
    s.rect(285.5 - P / 2, 104.67, P, 1.33, "#1c1330")
    s.rect(272, 109, P, 7, "#fff1cf")   # quill
    s.shape(poly([(272.3, 110), (273.7, 104.3), (275.3, 103), (274.7, 106.3)]), "#cdb4ff"); s.rect(272.67, 106, P, 3, "#9a8fc0")
    # a stack of story books on the left
    s.rect(30, 128, 26, 6, "#4e2f1a"); s.rect(30, 128, 26, P, "#6b4326")
    for bx, by, bw, bh, c in [(34, 122, 18, 6, "#a8304f"), (32, 116, 20, 6, "#3fb8a8"), (36, 111, 14, 5, "#ffc45a")]:
        s.shape(rrect(bx, by, bw, bh, 0.5), c)
        s.rect(bx + bw - 1.67, by + 2 * P, 1.33, bh - 4 * P, "#fff1cf")
        s.runs([(bx + bw - 1.67, by + 1 + k * 2 * P, 1.33, P) for k in range(int((bh - 2) * 1.5))], "#e8d8b0")
        s.runs([(bx + 2, by + P, P, bh - 2 * P), (bx + 3, by + P, P, bh - 2 * P)], mix(c, "#ffffff", 0.45))
    s.save("study.svg")


for f in (dock, rooftops, woods, square, market, finale, boutique, study):
    f()

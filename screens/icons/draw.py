"""Icons for the screens (gear, refresh, flag and friends), drawn with the same shapes and writer as ../../tools/ui.py
so they match the ui/*.svg set in both picture looks: smooth vector art here (High) and 16 x 16 chunky pixels in low/
(Low), with the same palette and dark outline, plus 8 x 8 twins in low/sm/ for the few drawn at 16px or less.
Run: python screens/icons/draw.py"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "tools"))
import ui  # noqa: E402
from ui import circle, rect, poly, line, arc  # noqa: E402

ui.OUT = HERE


def tooth(cx, cy, r0, r1, w, deg):
    """A gear tooth: a w wide bar from radius r0 to r1 at an angle."""
    a = math.radians(deg)
    ux, uy, nx, ny = math.cos(a), math.sin(a), -math.sin(a), math.cos(a)
    pts = [(cx + ux * r + nx * s * w / 2, cy + uy * r + ny * s * w / 2) for r, s in ((r0, -1), (r1, -1), (r1, 1), (r0, 1))]
    return poly(*pts)


ICONS = {
    "gear": [("a", circle(16, 16, 10.5))] + [("a", tooth(16, 16, 8, 14.6, 5.6, k * 45)) for k in range(8)] + [
        ("d", circle(16, 16, 6.6)),
        ("", circle(16, 16, 4)),
    ],
    "refresh": [
        ("a", arc(16, 16, 9.5, 4.4, 35, 300)),
        ("a", poly((19.5, 3), (29, 8.5), (20, 14.5))),
    ],
    "flag": [
        ("p", rect(5, 3, 8.5, 29.5, 1)),
        ("r", poly((8.5, 4.5), (17, 6.5), (27.5, 4.5), (27.5, 17.5), (17, 19.5), (8.5, 17.5))),
    ],
    "copy": [
        ("d", rect(11, 3.5, 28, 22, 1.5)),
        ("m", rect(4, 10, 21, 28.5, 1.5)),
        ("k", rect(8, 15, 17, 16.4)), ("k", rect(8, 19, 17, 20.4)), ("k", rect(8, 23, 14, 24.4)),
    ],
    "link": [
        ("a", line((7.5, 24.5), (15, 17), w=9.5)),
        ("", line((7.5, 24.5), (15, 17), w=3.4)),
        ("t", line((17, 15), (24.5, 7.5), w=9.5)),
        ("", line((17, 15), (24.5, 7.5), w=3.4)),
        ("a", line((13.2, 18.8), (16.6, 15.4), w=3)),
    ],
    "people": [
        ("t", circle(22, 10, 4.6)),
        ("t", rect(15, 16, 29, 27, 4)),
        ("r", circle(11, 12, 5.2)),
        ("r", rect(3, 19, 19, 29.5, 4.5)),
    ],
    "bubble": [
        ("m", rect(3, 4, 29, 21.5, 4)),
        ("m", poly((8, 20), (15, 20), (8, 28))),
        ("k", rect(8.5, 11.5, 11.5, 14.5)), ("k", rect(14.5, 11.5, 17.5, 14.5)), ("k", rect(20.5, 11.5, 23.5, 14.5)),
    ],
    "nosignal": [
        ("p", arc(16, 24, 16, 3.4, 220, 320)),
        ("p", arc(16, 24, 10, 3.4, 220, 320)),
        ("p", circle(16, 24, 3)),
        ("r", line((5.5, 5.5), (26.5, 26.5), w=3.8)),
    ],
    "wrench": [
        ("p", line((7, 25), (19, 13), w=5)),
        ("p", circle(21, 11, 7.2)),
        ("", poly((21, 11), (25, 2), (30.5, 7))),
        ("", circle(21, 11, 2.2)),
    ],
    "chevron": [
        ("a", poly((11, 5), (22.5, 16), (11, 27), (8.5, 24.5), (17, 16), (8.5, 7.5))),
    ],
    "mute": [
        ("m", poly((3, 12), (9, 12), (16, 5), (16, 27), (9, 20), (3, 20))),
        ("r", line((20, 11), (29, 21), w=3.4)),
        ("r", line((29, 11), (20, 21), w=3.4)),
    ],
    "block": [
        ("r", arc(16, 16, 11, 4.4, 0, 360)),
        ("r", line((8.5, 8.5), (23.5, 23.5), w=4.4)),
    ],
    "person": [
        ("a", circle(16, 10, 6)),
        ("a", rect(6, 18, 26, 29.5, 5)),
    ],
    "ferry": [
        ("m", rect(9, 9, 23, 17)),
        ("t", rect(11, 11, 14, 14)), ("t", rect(18, 11, 21, 14)),
        ("r", rect(13, 4, 19, 9)),
        ("a", poly((2, 17), (30, 17), (26, 26), (6, 26))),
    ],
}

# Low versions of icons whose thin parts melt on 16 pixels: the same picture with parts snapped to whole pixels
# (one pixel is two shape units) and kept a pixel apart.
LOW_FIX = {
    "refresh": [
        ("a", arc(15, 17, 9, 4, 40, 265)),
        ("a", poly((16, 1), (28, 8), (16, 15))),
    ],
    "copy": [
        ("d", rect(12, 4, 28, 22)),
        ("m", rect(4, 10, 20, 28)),
        ("k", rect(8, 14, 16, 16)), ("k", rect(8, 18, 16, 20)), ("k", rect(8, 22, 14, 24)),
    ],
    "people": [
        ("t", circle(22, 9, 4.5)),
        ("t", rect(16, 16, 30, 28, 3)),
        ("k", circle(10, 12, 6.5)),
        ("k", rect(0, 18, 20, 32, 4)),
        ("r", circle(10, 12, 4.5)),
        ("r", rect(2, 20, 18, 30, 3)),
    ],
    "bubble": [
        ("m", rect(2, 4, 30, 22, 4)),
        ("m", poly((8, 20), (16, 20), (8, 28))),
        ("k", rect(8, 10, 12, 14)), ("k", rect(14, 10, 18, 14)), ("k", rect(20, 10, 24, 14)),
    ],
    "nosignal": [
        ("p", arc(16, 24, 15, 4, 220, 320)),
        ("p", arc(16, 24, 9, 4, 220, 320)),
        ("p", circle(16, 24, 3)),
        ("r", line((5, 5), (27, 27), w=4)),
    ],
    "ferry": [
        ("m", rect(8, 8, 24, 18)),
        ("t", rect(10, 10, 14, 14)), ("t", rect(18, 10, 22, 14)),
        ("r", rect(12, 2, 18, 8)),
        ("a", poly((0, 18), (32, 18), (26, 28), (6, 28))),
    ],
}

# Small Low twins (low/sm/, see SM_FIX in ../../tools/ui.py) for the icons drawn at 16px or less: Settings rows and the
# quick chat topics (chevron) and the profile's new link button (refresh).
SM_FIX = {
    "chevron": (8, [
        "aa..",
        ".aa.",
        "..aa",
        ".aa.",
        "aa..",
    ]),
    "refresh": (8, [
        "..aaa.a",
        ".a...aa",
        "a...aaa",
        "a......",
        "a.....a",
        ".a...a.",
        "..aaa..",
    ]),
}

if __name__ == "__main__":
    for k, v in ICONS.items():
        ui.icon(k, v, LOW_FIX.get(k), SM_FIX.get(k))

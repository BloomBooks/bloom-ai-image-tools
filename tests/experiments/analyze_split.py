"""Offline analysis of how to split the generated grid into exactly N panels.
Replicates the foreground/connected-component logic and tests how merging
nearby components by various distance margins changes the piece count — to find
a margin that groups a panel's internal parts but keeps panels separate.

Run: py tests/experiments/analyze_split.py
"""

import os
import sys
from collections import deque
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(here, "output-grid.png")
im = Image.open(path).convert("RGB")

# Downscale for tractable pure-Python analysis (counts are scale-independent).
MAXDIM = 1000
scale = min(1.0, MAXDIM / max(im.size))
if scale < 1.0:
    im = im.resize((round(im.size[0] * scale), round(im.size[1] * scale)))
W, H = im.size
px = im.load()
print(f"analyzing {path} at {W}x{H}")

def is_fg(x, y):
    r, g, b = px[x, y]
    if r >= 242 and g >= 242 and b >= 242 and (max(r, g, b) - min(r, g, b)) <= 20:
        return False  # white-ish background
    return True

# Connected components (8-connectivity), collect bounding boxes.
visited = bytearray(W * H)
min_pixels = max(48, int(W * H * 0.0004))
boxes = []
for sy in range(H):
    for sx in range(W):
        idx = sy * W + sx
        if visited[idx] or not is_fg(sx, sy):
            continue
        q = deque([(sx, sy)])
        visited[idx] = 1
        l = r = sx
        t = bo = sy
        n = 0
        while q:
            x, y = q.popleft()
            n += 1
            if x < l: l = x
            if x > r: r = x
            if y < t: t = y
            if y > bo: bo = y
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H:
                        ni = ny * W + nx
                        if not visited[ni] and is_fg(nx, ny):
                            visited[ni] = 1
                            q.append((nx, ny))
        if n >= min_pixels:
            boxes.append([l, t, r, bo])

print(f"raw connected components (>= {min_pixels}px): {len(boxes)}")

def overlaps(a, b, m):
    return a[0] <= b[2] + m and b[0] <= a[2] + m and a[1] <= b[3] + m and b[1] <= a[3] + m

def merge(boxes, margin):
    pending = [list(b) for b in boxes]
    out = []
    while pending:
        cur = pending.pop()
        changed = True
        while changed:
            changed = False
            rest = []
            for b in pending:
                if overlaps(cur, b, margin):
                    cur = [min(cur[0], b[0]), min(cur[1], b[1]), max(cur[2], b[2]), max(cur[3], b[3])]
                    changed = True
                else:
                    rest.append(b)
            pending = rest
        out.append(cur)
    return out

long_edge = max(W, H)
for pct in (0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8):
    margin = round(long_edge * pct / 100)
    print(f"margin {pct:>4}% ({margin:>3}px) -> {len(merge(boxes, margin))} pieces")

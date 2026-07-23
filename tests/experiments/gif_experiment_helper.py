# Python side of tests/experiments/gif-animation-experiment.mjs: PNG <-> raw
# RGBA bridging, frame assembly, GIF encoding, and jitter metrics. The grid
# logic itself runs in Node against the real lib/imageSegmentation.ts; this
# file only does image I/O and measurement.
#
#   py gif_experiment_helper.py png2bin <sheet.png> <out.bin>   -> {"width","height"} on stdout
#   py gif_experiment_helper.py assemble <sheet.png> <cells.json> <out_dir>
#       Crops each cell (dx/dy-centered on the shared frame size), makes the
#       near-white background transparent (stand-in for the app's neural
#       remover), writes frames/frame-NN.png, contact.png, anim.gif, and prints
#       a metrics report to stdout.

import json
import math
import sys
from pathlib import Path

from PIL import Image


def png2bin(sheet_path: str, out_bin: str) -> None:
    image = Image.open(sheet_path).convert("RGBA")
    Path(out_bin).write_bytes(image.tobytes())
    print(json.dumps({"width": image.width, "height": image.height}))


WHITE_THRESHOLD = 242


def punch_white(frame: Image.Image) -> Image.Image:
    # Drops the white background AND any magenta frame-line remnants (incl.
    # their anti-aliased halo) — mirrors isBackgroundPixel + isMagentaishPixel
    # in lib/imageSegmentation.ts.
    data = frame.load()
    for y in range(frame.height):
        for x in range(frame.width):
            r, g, b, a = data[x, y]
            if a == 0:
                continue
            is_white = r >= WHITE_THRESHOLD and g >= WHITE_THRESHOLD and b >= WHITE_THRESHOLD
            is_magentaish = r >= 150 and b >= 150 and g <= min(r, b) - 25 and abs(r - b) <= 70
            if is_white or is_magentaish:
                data[x, y] = (r, g, b, 0)
    return frame


# Mirror of lib/imageSegmentation.ts eraseEdgeIntrudersFromFrameRaster — keep
# the two in sync. Erases narrow foreground components hugging a vertical
# frame edge (a neighboring frame's shoulder that rode along the crop).
def erase_edge_intruders(frame: Image.Image) -> int:
    width, height = frame.size
    px = frame.load()

    def is_fg(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        return a > 24

    visited = bytearray(width * height)
    components = []
    for start_y in range(height):
        for start_x in range(width):
            idx = start_y * width + start_x
            if visited[idx] or not is_fg(start_x, start_y):
                continue
            visited[idx] = 1
            stack = [(start_x, start_y)]
            pixels = []
            left = right = start_x
            while stack:
                x, y = stack.pop()
                pixels.append((x, y))
                left = min(left, x)
                right = max(right, x)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < width and 0 <= ny < height:
                            nidx = ny * width + nx
                            if not visited[nidx] and is_fg(nx, ny):
                                visited[nidx] = 1
                                stack.append((nx, ny))
            components.append((pixels, left, right))

    if not components:
        return 0
    largest = max(len(c[0]) for c in components)
    max_band = max(4, width * 18 // 100)
    edge_slack = max(5, round(width * 0.02))
    erased = 0
    for pixels, left, right in components:
        touches = left <= edge_slack or right >= width - 1 - edge_slack
        if not touches or (right - left + 1) > max_band or len(pixels) > largest * 0.25:
            continue
        for x, y in pixels:
            r, g, b, _ = px[x, y]
            px[x, y] = (r, g, b, 0)
        erased += 1
    return erased


def foreground_stats(frame: Image.Image):
    alpha = frame.getchannel("A")
    mask = alpha.point(lambda v: 255 if v > 24 else 0)
    bbox = mask.getbbox()
    if not bbox:
        return None
    total = 0.0
    sum_x = 0.0
    sum_y = 0.0
    pixels = mask.load()
    for y in range(bbox[1], bbox[3]):
        for x in range(bbox[0], bbox[2]):
            if pixels[x, y]:
                total += 1
                sum_x += x
                sum_y += y
    return {
        "centroid": [sum_x / total, sum_y / total],
        "bbox": list(bbox),
        "baseline": bbox[3],  # lowest foreground row = feet/ground contact
        "area": total,
    }


def assemble(sheet_path: str, cells_path: str, out_dir: str) -> None:
    sheet = Image.open(sheet_path).convert("RGBA")
    spec = json.loads(Path(cells_path).read_text())
    frame_w, frame_h = spec["frameWidth"], spec["frameHeight"]
    out = Path(out_dir)
    frames_dir = out / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    frames = []
    stats = []
    for index, cell in enumerate(spec["cells"]):
        crop = sheet.crop((cell["left"], cell["top"], cell["right"] + 1, cell["bottom"] + 1))
        frame = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
        frame.paste(crop, (cell["dx"], cell["dy"]))
        frame = punch_white(frame)
        erase_edge_intruders(frame)
        frame.save(frames_dir / f"frame-{index:02d}.png")
        frames.append(frame)
        stats.append(foreground_stats(frame))

    # Contact sheet: frames side by side on white with a thin border per cell.
    contact = Image.new("RGB", ((frame_w + 4) * len(frames) + 4, frame_h + 8), (150, 150, 150))
    for index, frame in enumerate(frames):
        tile = Image.new("RGBA", (frame_w, frame_h), (255, 255, 255, 255))
        tile.paste(frame, (0, 0), frame)
        contact.paste(tile.convert("RGB"), (4 + index * (frame_w + 4), 4))
    contact.save(out / "contact.png")

    # The looping GIF, same timing as the app (140ms, loop forever).
    if frames:
        base = Image.new("RGBA", (frame_w, frame_h), (255, 255, 255, 255))
        rendered = []
        for frame in frames:
            page = base.copy()
            page.paste(frame, (0, 0), frame)
            rendered.append(page.convert("P", palette=Image.ADAPTIVE))
        rendered[0].save(
            out / "anim.gif",
            save_all=True,
            append_images=rendered[1:],
            duration=140,
            loop=0,
            disposal=2,
        )

    # Jitter metrics: how much the subject moves between frames. Centroid sway
    # is expected during real motion; BASELINE drift and AREA swings are the
    # tell-tale signs of bad registration / scale wobble.
    valid = [s for s in stats if s]
    summary = {}
    if len(valid) >= 2:
        def spread(values):
            mean = sum(values) / len(values)
            return math.sqrt(sum((v - mean) ** 2 for v in values) / len(values))

        cxs = [s["centroid"][0] for s in valid]
        cys = [s["centroid"][1] for s in valid]
        baselines = [s["baseline"] for s in valid]
        areas = [s["area"] for s in valid]
        summary = {
            "frames": len(valid),
            "frameSize": [frame_w, frame_h],
            "centroidStd": [round(spread(cxs), 1), round(spread(cys), 1)],
            "baselineStd": round(spread(baselines), 1),
            "baselineRange": [min(baselines), max(baselines)],
            "areaMin": min(areas),
            "areaMax": max(areas),
        }

    print(json.dumps({"summary": summary, "frames": stats}))


if __name__ == "__main__":
    command = sys.argv[1]
    if command == "png2bin":
        png2bin(sys.argv[2], sys.argv[3])
    elif command == "assemble":
        assemble(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        raise SystemExit(f"unknown command: {command}")

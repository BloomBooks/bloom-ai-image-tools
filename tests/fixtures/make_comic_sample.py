"""Generates a synthetic multi-panel "comic" fixture for debugging the
Break Comic into Images tool: several tilted, bordered panels that each
contain distinct text, placed over a textured/colored background. Mirrors the
real-world input (multiple panels + text + rotation + background to remove).
"""

import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1400, 1000
bg = Image.new("RGB", (W, H), (210, 180, 140))  # tan / cork-ish

# Add a little noise-ish texture so there is a clear non-white background.
draw = ImageDraw.Draw(bg)
for x in range(0, W, 12):
    for y in range(0, H, 12):
        shade = (x * 7 + y * 13) % 24 - 12
        c = (max(0, min(255, 210 + shade)), max(0, min(255, 180 + shade)), max(0, min(255, 140 + shade)))
        draw.point((x, y), fill=c)


def font(size):
    for name in ("arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()


panels = [
    ("1. Diarrhoea is watery poo that happens three or more times a day. It can lead to dangerous dehydration.", (255, 255, 255)),
    ("2. Diarrhoea is caused by tiny germs that are too small to see. Germs travel easily into our mouths.", (255, 250, 235)),
    ("3. We need to replace fluids and salts to keep the body strong and prevent illness from dehydration.", (235, 248, 255)),
    ("4. A child with dehydration can have a dry mouth, sunken eyes, no tears, and loose skin.", (255, 240, 245)),
    ("5. ORS stands for Oral Rehydration Solution, the best drink to prevent and treat dehydration.", (240, 255, 240)),
    ("6. Prevent dehydration by using ORS as soon as diarrhoea begins. Breast milk is best for babies.", (250, 245, 255)),
    ("7. Children with bloody poo or who vomit must be seen by a health worker. Give ORS while waiting.", (255, 252, 230)),
    ("8. Zinc tablets reduce the amount of poo and help children recover more quickly from diarrhoea.", (245, 245, 255)),
    ("9. Young children with diarrhoea need tasty, mashed food and soups to make their body stronger.", (235, 255, 250)),
    ("10. Prevent germs spreading! Wash hands with soap, and immunise against measles and rotavirus.", (255, 245, 240)),
]

# Title banner across the top.
title = Image.new("RGBA", (1000, 90), (255, 255, 255, 255))
td = ImageDraw.Draw(title)
td.rectangle([0, 0, 999, 89], outline=(40, 90, 160), width=4)
td.text((30, 26), "Diarrhoea: 10 messages for children to learn & share", font=font(34), fill=(40, 90, 160))
bg.paste(title, (200, 8), title)

PW, PH = 300, 230
positions = [
    (40, 120), (380, 110), (720, 130), (1060, 115),
    (60, 380), (400, 400), (740, 385), (1070, 395),
    (220, 690), (760, 700),
]
angles = [-5, 4, -3, 6, 3, -4, 5, -2, -6, 4]

for (text, fill), (px, py), angle in zip(panels, positions, angles):
    panel = Image.new("RGBA", (PW, PH), (0, 0, 0, 0))
    pd = ImageDraw.Draw(panel)
    pd.rectangle([0, 0, PW - 1, PH - 1], fill=fill, outline=(40, 90, 160), width=8)
    # title bar
    pd.rectangle([8, 8, PW - 9, 60], fill=(40, 90, 160))
    pd.text((20, 20), "PANEL", font=font(28), fill=(255, 255, 255))
    # body text (wrapped)
    words = text.split()
    line, y = "", 90
    f = font(26)
    for w in words:
        trial = (line + " " + w).strip()
        if pd.textlength(trial, font=f) > PW - 40:
            pd.text((20, y), line, font=f, fill=(20, 20, 20))
            y += 34
            line = w
        else:
            line = trial
    if line:
        pd.text((20, y), line, font=f, fill=(20, 20, 20))
    # a simple drawn shape
    pd.ellipse([PW - 110, PH - 90, PW - 30, PH - 20], outline=(200, 60, 60), width=6)

    rotated = panel.rotate(angle, expand=True, resample=Image.BICUBIC)
    bg.paste(rotated, (px, py), rotated)

out = os.path.join(os.path.dirname(__file__), "comic-sample.png")
bg.save(out)
print("wrote", out, bg.size)

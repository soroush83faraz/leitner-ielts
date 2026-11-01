"""Generates the app icon set. Run: python3 design/make_icons.py (needs Pillow)."""
from PIL import Image, ImageDraw, ImageFont

TEAL = (14, 77, 87, 255)
CREAM = (255, 249, 238, 255)
SAND = (232, 222, 200, 255)
EDGE = (29, 106, 118, 255)
BOX = [(196, 87, 47), (182, 122, 14), (107, 143, 63), (47, 143, 143), (14, 77, 87)]
FONT = 'node_modules/@expo-google-fonts/newsreader/600SemiBold/Newsreader_600SemiBold.ttf'

def mark(size, fill=1.0, mono=False):
    """Stacked flashcards with an 'L' and five rising box bars. `fill` = share of the canvas used."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = size * fill / 100.0           # design on a 100-unit grid
    ox = oy = size * (1 - fill) / 2
    P = lambda x, y: (ox + x * u, oy + y * u)
    def card(x0, y0, x1, y1, color, r=7):
        d.rounded_rectangle([*P(x0, y0), *P(x1, y1)], radius=r * u, fill=color)
    ink = (0, 0, 0, 255) if mono else None
    card(18, 6, 82, 70, ink or EDGE)                 # back card
    card(12, 14, 88, 80, ink or SAND)                # middle card
    if mono:
        card(6, 22, 94, 94, ink)
        # knock out the glyph/bars so the silhouette stays readable as a monochrome icon
        f = ImageFont.truetype(FONT, int(46 * u))
        d.text(P(50, 50), 'L', font=f, anchor='mm', fill=(0, 0, 0, 0))
        return img
    card(6, 22, 94, 94, CREAM)                       # front card
    f = ImageFont.truetype(FONT, int(50 * u))
    d.text(P(50, 49), 'L', font=f, anchor='mm', fill=TEAL)
    for i, c in enumerate(BOX):                      # five boxes, rising like Leitner stages
        h = 5 + i * 2.4
        x = 24 + i * 11.6
        d.rounded_rectangle([*P(x, 84 - h), *P(x + 8.6, 84)], radius=1.8 * u, fill=(*c, 255))
    return img

def on_bg(img, size, bg=TEAL, radius=0):
    base = Image.new('RGBA', (size, size), bg)
    base.alpha_composite(img)
    return base

S = 1024
on_bg(mark(S, 0.74), S).convert('RGB').save('assets/icon.png')
mark(S, 0.62).save('assets/android-icon-foreground.png')            # inside the adaptive-icon safe zone
Image.new('RGBA', (S, S), TEAL).save('assets/android-icon-background.png')
m = mark(S, 0.62, mono=True)
m.save('assets/android-icon-monochrome.png')
mark(1024, 0.8).save('assets/splash-icon.png')
on_bg(mark(256, 0.8), 256).resize((48, 48), Image.LANCZOS).save('assets/favicon.png')
print('icons written')

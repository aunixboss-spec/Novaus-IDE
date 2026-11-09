"""Generate app icon: blue rounded square + white '</>' code glyph."""
import math
from PIL import Image, ImageDraw, ImageFont
import os

SIZE = 512
OUT = os.path.join(os.path.dirname(__file__), 'src', 'assets')
os.makedirs(OUT, exist_ok=True)

img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# rounded square with vertical gradient (VS Code blue #0e639c -> #1177bb -> cyan)
def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
c1, c2 = (14, 99, 156), (79, 195, 247)
grad = Image.new('RGBA', (SIZE, SIZE))
gd = ImageDraw.Draw(grad)
for y in range(SIZE):
    gd.line([(0, y), (SIZE, y)], fill=lerp(c1, c2, y / SIZE) + (255,))
mask = Image.new('L', (SIZE, SIZE), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([16, 16, SIZE - 16, SIZE - 16], radius=110, fill=255)
img.paste(grad, (0, 0), mask)

# shadowed "</>" glyph
font_path = "C:\\Windows\\Fonts\\segoeuibold.ttf"
if not os.path.exists(font_path):
    font_path = "C:\\Windows\\Fonts\\arialbd.ttf"
font = ImageFont.truetype(font_path, 210)
text = '</>'
bbox = d.textbbox((0, 0), text, font=font)
w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
x = (SIZE - w) / 2 - bbox[0]
y = (SIZE - h) / 2 - bbox[1] + 12
# subtle shadow
d.text((x + 6, y + 8), text, font=font, fill=(0, 30, 60, 110))
d.text((x, y), text, font=font, fill=(255, 255, 255, 255))

img.save(os.path.join(OUT, 'icon.png'))
img.save(os.path.join(OUT, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256), (512, 512)])
print('icon saved:', OUT)

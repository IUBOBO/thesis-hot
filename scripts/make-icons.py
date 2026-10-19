"""生成 Thesis NH 的图标：icon.png(512)、icon-192.png、apple-icon.png(180)、favicon.ico。
设计与 site/brand/logo.svg 一致：深色圆角方块 + 白色论文页 + 青色四角星。"""
from PIL import Image, ImageDraw
import math

BG = (19, 25, 28, 255)
PAGE = (242, 244, 243, 255)
FOLD = (195, 203, 203, 255)
LINE = (154, 166, 166, 255)
ACCENT = (44, 226, 232, 255)


def star_points(cx, cy, r):
    """四角星（凹菱形），用 8 个点近似。"""
    k = 0.18
    pts = []
    for i in range(4):
        a = -math.pi / 2 + i * math.pi / 2
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        a2 = a + math.pi / 4
        pts.append((cx + k * r * math.cos(a2), cy + k * r * math.sin(a2)))
    return pts


def render(size):
    s = size / 512
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def sc(*vals):
        return [v * s for v in vals]

    d.rounded_rectangle(sc(0, 0, 511, 511), radius=116 * s, fill=BG)

    # 纸张：左上直角，右上折角
    d.polygon([(158 * s, 118 * s), (290 * s, 118 * s), (356 * s, 184 * s),
               (356 * s, 394 * s), (158 * s, 394 * s)], fill=PAGE)
    # 折角
    d.polygon([(290 * s, 118 * s), (356 * s, 184 * s), (290 * s, 184 * s)], fill=FOLD)
    # 三条文字线
    for y, w in ((232, 108), (282, 108), (332, 70)):
        d.rectangle([186 * s, y * s, (186 + w) * s, (y + 18) * s], fill=LINE)
    # 四角星
    d.polygon(star_points(318 * s, 318 * s, 96 * s), fill=ACCENT)
    return img


render(512).save("site/brand/icon.png")
render(192).save("site/brand/icon-192.png")
render(180).save("site/brand/apple-icon.png")
render(256).save("site/brand/icon-256.png")
render(64).save("site/brand/favicon-64.png")
render(256).save("site/brand/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print("icons written")

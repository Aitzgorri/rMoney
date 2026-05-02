"""Generate rmy-file.ico — the file-type icon for .rmy backup files."""
from PIL import Image, ImageDraw, ImageFont
import os, sys

GREEN      = (61, 179, 90, 255)   # #3DB35A — matches rMoney app icon
FOLD_GREEN = (42, 138, 64, 255)   # slightly darker for the fold triangle
WHITE      = (255, 255, 255, 255)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\georgiab.ttf",
    r"C:\Windows\Fonts\georgia.ttf",
    r"C:\Windows\Fonts\timesbd.ttf",
    r"C:\Windows\Fonts\times.ttf",
]

def load_font(size):
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)

def draw_icon(size):
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad  = max(2, round(size * 0.08))
    fold = max(4, round(size * 0.22))

    l, t, r, b = pad, pad, size - pad, size - pad
    fx, fy = r - fold, t + fold          # fold corner point

    # Main document body (5-point polygon with cut top-right corner)
    draw.polygon([(l, t), (fx, t), (r, fy), (r, b), (l, b)], fill=GREEN)

    # Fold triangle (darker green)
    draw.polygon([(fx, t), (r, fy), (fx, fy)], fill=FOLD_GREEN)

    # "r" glyph — only at 32px and above
    if size >= 32:
        font_px = max(10, round(size * 0.44))
        font    = load_font(font_px)
        text    = "r"

        # textbbox returns (left, top, right, bottom) relative to anchor
        bb = draw.textbbox((0, 0), text, font=font)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]

        # Centre horizontally; centre vertically in the body area below the fold
        cx = (l + r) // 2
        cy = (fy + b) // 2 + round(size * 0.04)   # nudge down slightly
        tx = cx - tw // 2 - bb[0]
        ty = cy - th // 2 - bb[1]

        draw.text((tx, ty), text, fill=WHITE, font=font)

    return img


def main():
    out_dir = os.path.join(os.path.dirname(__file__),
                           "..", "app", "src-tauri", "icons")
    out_path = os.path.join(out_dir, "rmy-file.ico")

    sizes  = [256, 128, 64, 48, 32, 16]
    frames = [draw_icon(s) for s in sizes]

    frames[0].save(out_path, format="ICO", append_images=frames[1:])
    print(f"Saved {out_path}")

    # Also write a 256-px PNG for reference / inspection
    png_path = os.path.join(out_dir, "rmy-file-preview.png")
    frames[0].save(png_path, format="PNG")
    print(f"Preview: {png_path}")


if __name__ == "__main__":
    main()

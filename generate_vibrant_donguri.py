#!/usr/bin/env python3
"""
Generate ultra-cute, vivid, simplified color Donguri-san (56x80)
Specifically designed for LilyGO T-Dongle-S3 0.96" ST7735 LCD:
- Bright caramel/orange acorn cap (high contrast against dark navy #0a0e17)
- Warm cream face (not pale white)
- Big shiny anime eyes + rosy pink cheeks
- Bold clean outlines
"""

from PIL import Image, ImageDraw

BG_COLOR = (10, 14, 23)      # #0a0e17 (Match LCD background 0x0863)

# Bold, simple, vibrant color palette
OUTLINE = (20, 20, 20)        # Bold dark outline
CAP_MAIN = (245, 124, 0)     # Vivid caramel orange acorn cap (#F57C00)
CAP_LIGHT = (255, 183, 77)   # Cap highlight (#FFB74D)
CAP_PATTERN = (230, 81, 0)   # Cap texture dots (#E65100)

FACE_BASE = (255, 224, 130)  # Warm bright cream yellow (#FFE082)
FACE_SHADOW = (255, 179, 0)  # Face base shadow (#FFB300)

CHEEK = (255, 64, 129)       # Vivid hot pink cheeks (#FF4081)
EYE_BLACK = (10, 10, 10)     # Jet black eye
WHITE = (255, 255, 255)      # Eye highlight & teeth
MOUTH_RED = (216, 27, 96)    # Cute red mouth (#D81B60)

USB_BODY = (189, 189, 189)   # Bright silver (#BDBDBD)
USB_HILITE = (245, 245, 245) # White silver
USB_HOLE = (66, 66, 66)      # USB hole

GOLD = (255, 214, 0)         # Shiny gold crown (#FFD600)
GOLD_SHADOW = (255, 171, 0)
CYAN_GLOW = (0, 229, 255)    # Neon cyan data (#00E5FF)


def create_canvas():
    return Image.new("RGB", (56, 80), BG_COLOR)


def draw_usb_plug(draw, y_offset=0):
    # USB plug at top: X: 22 to 33, Y: 4 to 12
    t = 4 + y_offset
    b = 12 + y_offset
    # Outline
    draw.rectangle([21, t - 1, 34, b], fill=OUTLINE)
    # Bright silver body
    draw.rectangle([22, t, 33, b - 1], fill=USB_BODY)
    draw.line([(23, t), (23, b - 1)], fill=USB_HILITE)
    # 2 Pin holes
    draw.rectangle([24, t + 3, 26, t + 5], fill=USB_HOLE)
    draw.rectangle([29, t + 3, 31, t + 5], fill=USB_HOLE)


def draw_acorn_cap(draw):
    # Acorn cap: Big, cute, rounded dome Y: 11 to 35
    # Bold outline
    draw.ellipse([7, 11, 48, 36], fill=OUTLINE)
    # Main bright orange/caramel fill
    draw.ellipse([9, 13, 46, 34], fill=CAP_MAIN)
    # Top highlight curve
    draw.arc([11, 14, 44, 25], 200, 340, fill=CAP_LIGHT, width=2)
    # Pattern dots (cute acorn scales)
    for px, py in [(18, 20), (28, 19), (38, 20),
                   (14, 26), (23, 25), (33, 25), (42, 26),
                   (18, 30), (28, 30), (38, 30)]:
        draw.rectangle([px, py, px + 1, py + 1], fill=CAP_PATTERN)
    # Cap bottom brim
    draw.arc([8, 26, 47, 36], 10, 170, fill=OUTLINE, width=2)


def draw_body_and_face(draw):
    # Cute round chubby face: Y: 29 to 71
    # Bold outline
    draw.ellipse([9, 29, 46, 71], fill=OUTLINE)
    # Warm cream face fill
    draw.ellipse([11, 31, 44, 69], fill=FACE_BASE)
    # Bottom shading curve
    draw.arc([12, 32, 43, 68], 20, 160, fill=FACE_SHADOW, width=3)
    # Little feet
    draw.rectangle([22, 70, 26, 73], fill=OUTLINE)
    draw.rectangle([23, 71, 25, 72], fill=CAP_MAIN)
    draw.rectangle([29, 70, 33, 73], fill=OUTLINE)
    draw.rectangle([30, 71, 32, 72], fill=CAP_MAIN)


def draw_cheeks(draw):
    # Big round cute blushing pink cheeks!
    draw.ellipse([13, 46, 18, 51], fill=CHEEK)
    draw.ellipse([37, 46, 42, 51], fill=CHEEK)


def generate_donguri_idle():
    im = create_canvas()
    d = ImageDraw.Draw(im)

    draw_usb_plug(d)
    draw_acorn_cap(d)
    draw_body_and_face(d)
    draw_cheeks(d)

    # Eyes: Super cute happy sleepy curves ( ^  ^ )
    d.arc([17, 40, 25, 46], 200, 340, fill=EYE_BLACK, width=2)
    d.arc([30, 40, 38, 46], 200, 340, fill=EYE_BLACK, width=2)

    # Cute smile mouth
    d.arc([24, 48, 31, 54], 10, 170, fill=MOUTH_RED, width=2)

    # Cute little hands on belly
    draw_hand(d, 18, 56)
    draw_hand(d, 32, 56)

    # Big clear "Zzz"
    d.text((43, 8), "z", fill=(128, 216, 255))
    d.text((47, 15), "Z", fill=(0, 229, 255))

    return im


def generate_donguri_receiving():
    im = create_canvas()
    d = ImageDraw.Draw(im)

    draw_usb_plug(d)
    draw_acorn_cap(d)
    draw_body_and_face(d)
    draw_cheeks(d)

    # Big round shiny anime eyes!
    # Left eye
    d.ellipse([16, 38, 24, 47], fill=EYE_BLACK)
    d.ellipse([18, 39, 21, 43], fill=WHITE)   # Main shiny highlight
    d.ellipse([21, 43, 22, 45], fill=WHITE)   # Sub highlight
    # Right eye
    d.ellipse([31, 38, 39, 47], fill=EYE_BLACK)
    d.ellipse([33, 39, 36, 43], fill=WHITE)
    d.ellipse([36, 43, 37, 45], fill=WHITE)

    # Open happy mouth munching data!
    d.ellipse([23, 47, 32, 56], fill=MOUTH_RED, outline=OUTLINE)
    d.ellipse([25, 51, 30, 55], fill=(255, 128, 171)) # Pink tongue

    # Glowing cyan data packet in hands
    draw_hand(d, 16, 54)
    draw_hand(d, 34, 54)
    d.ellipse([24, 55, 31, 62], fill=CYAN_GLOW, outline=WHITE)

    # Radio waves from USB
    d.arc([4, 6, 16, 18], 220, 340, fill=CYAN_GLOW, width=2)
    d.arc([1, 2, 19, 20], 220, 340, fill=WHITE, width=1)

    return im


def generate_donguri_typing():
    im = create_canvas()
    d = ImageDraw.Draw(im)

    draw_usb_plug(d)
    draw_acorn_cap(d)
    draw_body_and_face(d)
    draw_cheeks(d)

    # Determined cute eyebrows
    d.line([(17, 37), (24, 40)], fill=EYE_BLACK, width=2)
    d.line([(38, 37), (31, 40)], fill=EYE_BLACK, width=2)

    # Focused sharp eyes
    d.ellipse([17, 40, 24, 47], fill=EYE_BLACK)
    d.ellipse([18, 41, 21, 44], fill=WHITE)
    d.ellipse([31, 40, 38, 47], fill=EYE_BLACK)
    d.ellipse([32, 41, 35, 44], fill=WHITE)

    # Serious determined mouth
    d.line([(24, 50), (31, 50)], fill=MOUTH_RED, width=2)

    # Keyboard at bottom
    d.rectangle([10, 60, 45, 69], fill=(55, 71, 79), outline=OUTLINE)
    for kx in range(12, 44, 4):
        d.rectangle([kx, 62, kx + 2, 64], fill=WHITE)
        d.rectangle([kx, 65, kx + 2, 67], fill=WHITE)

    # Multiple typing hands (motion blur)
    draw_hand(d, 14, 55)
    draw_hand(d, 20, 53)
    draw_hand(d, 35, 55)
    draw_hand(d, 29, 53)

    # Bright sparks
    d.line([(7, 58), (11, 56)], fill=GOLD, width=2)
    d.line([(44, 56), (48, 58)], fill=CYAN_GLOW, width=2)

    return im


def generate_donguri_done():
    im = create_canvas()
    d = ImageDraw.Draw(im)

    # Big shiny gold crown (👑) on cap!
    crown_pts = [(17, 13), (17, 4), (22, 8), (27, 2), (32, 8), (37, 4), (37, 13)]
    d.polygon(crown_pts, fill=GOLD, outline=OUTLINE)
    # Crown jewels
    d.rectangle([21, 9, 23, 11], fill=(255, 23, 68)) # Ruby
    d.rectangle([26, 8, 28, 10], fill=CYAN_GLOW)     # Diamond
    d.rectangle([31, 9, 33, 11], fill=(255, 23, 68)) # Ruby

    draw_acorn_cap(d)
    draw_body_and_face(d)
    draw_cheeks(d)

    # Super happy wink / squint eyes ( ^  ^ )
    d.arc([16, 39, 25, 46], 200, 340, fill=EYE_BLACK, width=2)
    d.arc([30, 39, 39, 46], 200, 340, fill=EYE_BLACK, width=2)

    # Big open laughing mouth with white teeth!
    d.ellipse([22, 47, 33, 57], fill=MOUTH_RED, outline=OUTLINE)
    d.rectangle([24, 48, 31, 51], fill=WHITE) # White teeth
    d.ellipse([25, 52, 30, 56], fill=(255, 128, 171)) # Tongue

    # Hands up high in celebration (BANZAI!)
    draw_hand(d, 7, 34)
    draw_hand(d, 42, 34)

    # Sparkle stars
    d.line([(13, 5), (15, 5)], fill=GOLD, width=1)
    d.line([(14, 4), (14, 6)], fill=GOLD, width=1)
    d.line([(39, 5), (41, 5)], fill=GOLD, width=1)
    d.line([(40, 4), (40, 6)], fill=GOLD, width=1)

    return im


def draw_hand(draw, x, y):
    # Cute little round mitten hand
    draw.ellipse([x, y, x + 6, y + 6], fill=CAP_MAIN, outline=OUTLINE)


if __name__ == "__main__":
    images = {
        "idle": generate_donguri_idle(),
        "receiving": generate_donguri_receiving(),
        "typing": generate_donguri_typing(),
        "done": generate_donguri_done(),
    }

    for name, img in images.items():
        img.save(f"/tmp/pixel_donguri_{name}.png")
        preview = img.resize((56 * 4, 80 * 4), Image.Resampling.NEAREST)
        preview.save(f"/tmp/preview_donguri_{name}.png")
    print("Generated ultra-cute vibrant donguri images.")

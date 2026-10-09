#!/usr/bin/env python3
"""
Generate ultra-clear, high-contrast, cute pixel-art icons for Donguri-san (56x80)
optimized for LilyGO T-Dongle-S3 0.96" ST7735 LCD (dark navy background #0a0e17).
"""

from PIL import Image, ImageDraw

BG_COLOR = (10, 14, 23)  # #0a0e17 (Match LCD right sprite background 0x0863)
OUTLINE = (35, 18, 5)    # Very dark brown outline
CAP_DARK = (90, 42, 12)   # Deep acorn cap
CAP_MID = (140, 68, 20)   # Acorn cap main
CAP_LIGHT = (185, 95, 30) # Acorn cap highlight
CAP_HILITE = (220, 140, 60) # Top rim highlight

FACE_BASE = (255, 218, 160) # Bright warm skin
FACE_SHADOW = (230, 180, 120) # Lower face shading
CHEEK = (255, 120, 130)   # Soft pink cheek
EYE_DARK = (20, 10, 5)    # Eye dark
WHITE = (255, 255, 255)

USB_MET_DARK = (70, 80, 95)
USB_MET_MID = (160, 175, 195)
USB_MET_LIGHT = (225, 235, 245)
USB_PIN_HOLE = (30, 35, 45)

GOLD = (255, 215, 0)
GOLD_DARK = (200, 150, 0)
RUBY = (230, 30, 60)

CYAN_GLOW = (64, 224, 255)
KEY_BASE = (50, 60, 75)
KEY_WHITE = (220, 230, 240)


def create_base_canvas():
    return Image.new("RGB", (56, 80), BG_COLOR)


def draw_usb_plug(draw, y_offset=0):
    # USB plug on top of acorn cap
    # X: 22 to 33 (width 12), Y: 4 to 12
    top = 4 + y_offset
    bot = 12 + y_offset
    # Outline
    draw.rectangle([21, top - 1, 34, bot], fill=OUTLINE)
    # Metallic body
    draw.rectangle([22, top, 33, bot - 1], fill=USB_MET_MID)
    # Highlight left
    draw.line([(23, top), (23, bot - 1)], fill=USB_MET_LIGHT)
    # Right shadow
    draw.line([(32, top), (32, bot - 1)], fill=USB_MET_DARK)
    # Pin holes
    draw.rectangle([24, top + 3, 26, top + 5], fill=USB_PIN_HOLE)
    draw.rectangle([29, top + 3, 31, top + 5], fill=USB_PIN_HOLE)


def draw_acorn_cap(draw):
    # Cap from Y: 11 to 32, dome shape
    # Outer dark shape
    draw.ellipse([9, 11, 46, 34], fill=OUTLINE)
    # Main fill
    draw.ellipse([11, 13, 44, 32], fill=CAP_MID)
    # Cross hatch / texture rows
    for row in range(16, 31, 3):
        draw.arc([12, row - 4, 43, row + 4], 0, 180, fill=CAP_DARK)
    # Top highlight
    draw.arc([13, 14, 42, 26], 190, 350, fill=CAP_LIGHT, width=2)
    # Cap brim rim
    draw.arc([9, 26, 46, 36], 10, 170, fill=CAP_DARK, width=2)


def draw_body_and_face(draw):
    # Body from Y: 28 to 70
    draw.ellipse([10, 28, 45, 72], fill=OUTLINE)
    # Face base
    draw.ellipse([12, 30, 43, 70], fill=FACE_BASE)
    # Bottom shadow
    draw.arc([13, 31, 42, 69], 20, 160, fill=FACE_SHADOW, width=4)
    # Feet / stand at bottom
    draw.rectangle([23, 72, 32, 75], fill=OUTLINE)
    draw.rectangle([24, 73, 31, 74], fill=CAP_DARK)


def draw_cheeks(draw):
    draw.ellipse([14, 47, 19, 51], fill=CHEEK)
    draw.ellipse([36, 47, 41, 51], fill=CHEEK)


def generate_donguri_idle():
    im = create_base_canvas()
    d = ImageDraw.Draw(im)

    draw_usb_plug(d)
    draw_acorn_cap(d)
    draw_body_and_face(d)
    draw_cheeks(d)

    # Eyes: Happy sleeping curves ( ^ ^ )
    # Left eye
    d.arc([18, 41, 25, 47], 200, 340, fill=EYE_DARK, width=2)
    # Right eye
    d.arc([30, 41, 37, 47], 200, 340, fill=EYE_DARK, width=2)

    # Smile mouth (small cute smile)
    d.arc([25, 49, 30, 54], 10, 170, fill=EYE_DARK, width=2)

    # Cute little hands resting on tummy
    d.ellipse([18, 56, 24, 61], fill=CAP_MID, outline=OUTLINE)
    d.ellipse([31, 56, 37, 61], fill=CAP_MID, outline=OUTLINE)

    # Floating "Zzz"
    d.text((42, 10), "z", fill=(100, 180, 255))
    d.text((46, 17), "Z", fill=(140, 210, 255))

    return im


def generate_donguri_receiving():
    im = create_base_canvas()
    d = ImageDraw.Draw(im)

    draw_usb_plug(d)
    draw_acorn_cap(d)
    draw_body_and_face(d)

    # Big sparkly eyes (watching incoming data!)
    # Left eye
    d.ellipse([17, 39, 24, 47], fill=EYE_DARK)
    d.ellipse([19, 40, 21, 43], fill=WHITE)  # Big highlight
    d.ellipse([21, 44, 22, 45], fill=WHITE)  # Small highlight
    # Right eye
    d.ellipse([31, 39, 38, 47], fill=EYE_DARK)
    d.ellipse([33, 40, 35, 43], fill=WHITE)
    d.ellipse([35, 44, 36, 45], fill=WHITE)

    # Puffy cheeks (munching!)
    d.ellipse([13, 46, 19, 53], fill=CHEEK)
    d.ellipse([36, 46, 42, 53], fill=CHEEK)

    # Open happy mouth eating data nut!
    d.ellipse([24, 48, 31, 57], fill=(180, 30, 60), outline=OUTLINE)
    d.arc([25, 53, 30, 56], 0, 180, fill=(255, 120, 140))  # Tongue

    # Hands holding a glowing data nut / packet
    d.ellipse([16, 54, 23, 60], fill=CAP_MID, outline=OUTLINE)
    d.ellipse([32, 54, 39, 60], fill=CAP_MID, outline=OUTLINE)
    # Glowing blue data acorn between hands
    d.ellipse([24, 55, 31, 63], fill=CYAN_GLOW, outline=WHITE)

    # WiFi signal arcs over head
    d.arc([4, 6, 16, 18], 220, 340, fill=CYAN_GLOW, width=2)
    d.arc([1, 2, 19, 20], 220, 340, fill=(140, 240, 255), width=1)

    return im


def generate_donguri_typing():
    im = create_base_canvas()
    d = ImageDraw.Draw(im)

    draw_usb_plug(d)
    draw_acorn_cap(d)
    draw_body_and_face(d)
    draw_cheeks(d)

    # Serious / focused energetic eyes (typing intensely!)
    # Eyebrows (determined angle)
    d.line([(17, 39), (24, 42)], fill=EYE_DARK, width=2)
    d.line([(38, 39), (31, 42)], fill=EYE_DARK, width=2)

    # Focused eyes
    d.ellipse([18, 42, 24, 48], fill=EYE_DARK)
    d.ellipse([19, 43, 21, 45], fill=WHITE)
    d.ellipse([31, 42, 37, 48], fill=EYE_DARK)
    d.ellipse([32, 43, 34, 45], fill=WHITE)

    # Determined mouth
    d.line([(25, 52), (30, 52)], fill=EYE_DARK, width=2)

    # Keyboard at bottom
    d.rectangle([11, 62, 44, 71], fill=KEY_BASE, outline=OUTLINE)
    # Key grid
    for kx in range(13, 43, 4):
        d.rectangle([kx, 64, kx + 2, 66], fill=KEY_WHITE)
        d.rectangle([kx, 67, kx + 2, 69], fill=KEY_WHITE)

    # Fast typing hands (multiple motion blur hands!)
    # Hand left pos 1 & 2
    d.ellipse([14, 57, 20, 62], fill=CAP_MID, outline=OUTLINE)
    d.ellipse([19, 55, 25, 60], fill=(200, 110, 40), outline=CAP_LIGHT)
    # Hand right pos 1 & 2
    d.ellipse([35, 57, 41, 62], fill=CAP_MID, outline=OUTLINE)
    d.ellipse([30, 55, 36, 60], fill=(200, 110, 40), outline=CAP_LIGHT)

    # Sparks / keystroke burst
    d.line([(8, 60), (12, 58)], fill=GOLD, width=1)
    d.line([(43, 58), (47, 60)], fill=CYAN_GLOW, width=1)
    d.line([(27, 59), (28, 56)], fill=GOLD, width=1)

    return im


def generate_donguri_done():
    im = create_base_canvas()
    d = ImageDraw.Draw(im)

    # Golden Crown on top of cap (Y: 2 to 11)
    d.polygon([(18, 12), (18, 4), (22, 8), (27, 2), (32, 8), (36, 4), (36, 12)], fill=GOLD, outline=GOLD_DARK)
    # Crown jewels
    d.rectangle([21, 9, 23, 11], fill=RUBY)
    d.rectangle([26, 8, 28, 10], fill=CYAN_GLOW)
    d.rectangle([31, 9, 33, 11], fill=RUBY)

    draw_acorn_cap(d)
    draw_body_and_face(d)
    draw_cheeks(d)

    # Big happy wink / smiling eyes ( ^ v ^ )
    d.arc([17, 39, 25, 47], 200, 340, fill=EYE_DARK, width=2)
    d.arc([30, 39, 38, 47], 200, 340, fill=EYE_DARK, width=2)

    # Open wide laughing mouth
    d.ellipse([23, 47, 32, 57], fill=(200, 30, 50), outline=OUTLINE)
    d.rectangle([25, 48, 30, 51], fill=WHITE) # Bright white teeth!
    d.arc([24, 52, 31, 56], 0, 180, fill=(255, 130, 150)) # Tongue

    # Banzai hands up in the air!
    # Left hand high
    d.ellipse([8, 33, 15, 41], fill=CAP_MID, outline=OUTLINE)
    # Right hand high
    d.ellipse([40, 33, 47, 41], fill=CAP_MID, outline=OUTLINE)

    # Sparkles around crown
    d.line([(14, 5), (16, 5)], fill=GOLD, width=1)
    d.line([(15, 4), (15, 6)], fill=GOLD, width=1)
    d.line([(38, 5), (40, 5)], fill=GOLD, width=1)
    d.line([(39, 4), (39, 6)], fill=GOLD, width=1)

    return im


if __name__ == "__main__":
    images = {
        "idle": generate_donguri_idle(),
        "receiving": generate_donguri_receiving(),
        "typing": generate_donguri_typing(),
        "done": generate_donguri_done(),
    }

    for name, img in images.items():
        img.save(f"/tmp/pixel_donguri_{name}.png")
        # 4倍拡大プレビュー保存
        preview = img.resize((56 * 4, 80 * 4), Image.Resampling.NEAREST)
        preview.save(f"/tmp/preview_donguri_{name}.png")
    print("Successfully generated all 4 pixel-art donguri images.")

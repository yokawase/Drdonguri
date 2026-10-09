#!/usr/bin/env python3
"""
Convert pixel art images to donguri_images.h (RGB565 C array)
"""
import os
from PIL import Image

def rgb_to_rgb565(r, g, b):
    # Standard 16-bit RGB565: RRRRRGGG GGGBBBBB
    return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)

def generate_header():
    faces = ['idle', 'receiving', 'typing', 'done']
    
    header_path = "/home/medart-code/Drdonguri/firmware/src/donguri_images.h"
    with open(header_path, "w", encoding="utf-8") as f:
        f.write("#pragma once\n")
        f.write("#include <Arduino.h>\n\n")
        f.write("// どんぐりさん 超高視認性ピクセルアート (56x80, RGB565)\n")
        f.write("#define DONGURI_IMG_W 56\n")
        f.write("#define DONGURI_IMG_H 80\n\n")
        
        for face in faces:
            img_path = f"/tmp/pixel_donguri_{face}.png"
            img = Image.open(img_path).convert("RGB")
            w, h = img.size
            assert w == 56 and h == 80
            
            f.write(f"// {face.upper()} 表情スプライト\n")
            f.write(f"const uint16_t donguri_{face}[DONGURI_IMG_W * DONGURI_IMG_H] PROGMEM = {{\n")
            
            pixels = []
            for y in range(h):
                for x in range(w):
                    r, g, b = img.getpixel((x, y))
                    rgb565 = rgb_to_rgb565(r, g, b)
                    pixels.append(f"0x{rgb565:04X}")
            
            # 16個ずつ改行
            for i in range(0, len(pixels), 16):
                chunk = pixels[i:i+16]
                line = "    " + ", ".join(chunk)
                if i + 16 < len(pixels):
                    line += ","
                f.write(line + "\n")
            f.write("};\n\n")
            
    print(f"Generated {header_path} successfully!")

if __name__ == "__main__":
    generate_header()

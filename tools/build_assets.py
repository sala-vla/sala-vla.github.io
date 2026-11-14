#!/usr/bin/env python3
"""Export website figures from the published main.pdf.

Usage: python tools/build_assets.py [path/to/main.pdf]
Dependencies: PyMuPDF and Pillow.

The page numbers and crop rectangles below refer to the 25-page November 2026
paper. Coordinates are PDF points, measured from the top-left of each page.
They include the complete figure artwork, leaving the paper's caption out.
Recheck these rectangles when replacing the PDF with a differently laid-out file.
"""

import argparse
from io import BytesIO
from pathlib import Path

import pymupdf
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
# filename, paper page (1-based), artwork bounds, output width
FIGURES = [
    ("teaser.png", 2, (70.866, 77.952, 541.142, 217.533), 2400),  # Fig. 1
    ("method_overview.png", 4, (70.866, 77.951, 541.140, 286.208), 2400),  # Fig. 2
    ("real_data.jpg", 6, (70.866, 77.951, 541.140, 221.729), 2400),  # Fig. 3
    ("scaling_pre_post.png", 9, (70.866, 77.951, 541.140, 228.981), 2400),  # Fig. 4
    ("scene_pairs.png", 10, (70.866, 77.951, 541.142, 273.649), 2200),  # Fig. 5
    ("quantizer_losses.png", 11, (343.622, 363.223, 541.135, 469.833), 1400),  # Fig. 7
    ("retrieval_robotwin.jpg", 19, (90.124, 141.544, 541.588, 368.061), 2070),  # Fig. 8a
    ("retrieval_human_shared.jpg", 19, (90.124, 384.232, 541.597, 611.544), 2070),  # Fig. 8b
    ("retrieval_human_unseen.jpg", 20, (82.624, 214.207, 529.385, 552.996), 2070),  # Fig. 9
    ("robotwin_embodiments.jpg", 22, (70.866, 509.679, 541.140, 581.253), 2200),  # Fig. 11
]


def save(image, path, width):
    height = round(image.height * width / image.width)
    image = image.resize((width, height), Image.Resampling.LANCZOS)
    if path.suffix == ".jpg":
        image.convert("RGB").save(path, quality=92, optimize=True, subsampling=0)
    else:
        image.save(path, optimize=True)
    print(f"{path.name}: {width} × {height}, {path.stat().st_size // 1024} KB")


def render(document, page_number, bounds, width):
    clip = pymupdf.Rect(bounds)
    scale = width / clip.width
    pixmap = document[page_number - 1].get_pixmap(
        matrix=pymupdf.Matrix(scale, scale), clip=clip, alpha=False
    )
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paper", nargs="?", type=Path, default=ROOT / "main.pdf")
    args = parser.parse_args()
    output = ROOT / "static" / "images"
    output.mkdir(parents=True, exist_ok=True)
    with pymupdf.open(args.paper) as document:
        if len(document) != 25:
            raise ValueError("Expected the 25-page final paper; check the crop rectangles first.")
        for filename, page_number, bounds, width in FIGURES:
            save(render(document, page_number, bounds, width), output / filename, width)

        # Fig. 13: extract the robot photograph at its native resolution.
        robot = document[23].get_image_info(xrefs=True)[0]
        source = document.extract_image(robot["xref"])
        image = Image.open(BytesIO(source["image"])).convert("RGBA")
        if source.get("smask"):
            mask = document.extract_image(source["smask"])
            image.putalpha(Image.open(BytesIO(mask["image"])).convert("L"))
        image = Image.alpha_composite(Image.new("RGBA", image.size, "white"), image)
        save(image, output / "sharpa_robot.jpg", 900)

        # Fig. 14: each task's frame sequence and atomic-action descriptions.
        bounds = pymupdf.Rect(70.866, 161.150, 541.134, 606.057)
        bands = [(0.021, 0.245), (0.270, 0.495), (0.520, 0.746), (0.781, 1.0)]
        for index, (top, bottom) in enumerate(bands):
            clip = (bounds.x0, bounds.y0 + bounds.height * top,
                    bounds.x1, bounds.y0 + bounds.height * bottom)
            save(render(document, 25, clip, 2200), output / f"real_task_{index}.jpg", 2200)


if __name__ == "__main__":
    main()

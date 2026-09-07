import sys
from PIL import Image
import numpy as np

def process_logo(src_path="fotolar/unnamed.png", output_path="public/assets/logo.png"):
    src = Image.open(src_path).convert('RGB')
    arr = np.array(src, dtype=float)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    h, w, _ = arr.shape
    region_mask = np.zeros((h, w), dtype=bool)
    # Bounding box for nose profile & 'Prof. Dr.'
    region_mask[320:500, 140:620] = True
    # Bounding box for 'ESIN YALCINKAYA' & 'KULAK...' & lower nose
    region_mask[500:645, 140:915] = True

    rb = r - b
    gold_signal = np.maximum(0, rb - 3.5)

    # Calculate smooth alpha
    alpha = np.zeros((h, w), dtype=float)
    alpha[region_mask] = np.clip(gold_signal[region_mask] / 15.0, 0, 1)
    alpha = alpha * alpha * (3.0 - 2.0 * alpha)  # smoothstep

    # Unpremultiply white background for transparent rendering
    gold_palette = np.array([195.0, 165.0, 105.0])
    out_rgb = np.zeros((h, w, 3), dtype=float)

    for c in range(3):
        channel = arr[:, :, c]
        unpremult = (channel - (1.0 - alpha) * 255.0) / np.maximum(alpha, 0.05)
        clean_c = np.where(
            alpha > 0.4,
            unpremult,
            np.where(alpha > 0.1, unpremult * (alpha - 0.1) / 0.3 + gold_palette[c] * (0.4 - alpha) / 0.3, gold_palette[c])
        )
        out_rgb[:, :, c] = np.clip(clean_c, 0, 255)

    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, 0] = out_rgb[:, :, 0].astype(np.uint8)
    rgba[:, :, 1] = out_rgb[:, :, 1].astype(np.uint8)
    rgba[:, :, 2] = out_rgb[:, :, 2].astype(np.uint8)
    rgba[:, :, 3] = (alpha * 255).astype(np.uint8)

    img_rgba = Image.fromarray(rgba, mode='RGBA')

    # Crop to non-zero alpha region with padding
    y_idx, x_idx = np.where(rgba[:, :, 3] > 10)
    pad = 20
    x0, x1 = max(0, x_idx.min() - pad), min(w, x_idx.max() + pad)
    y0, y1 = max(0, y_idx.min() - pad), min(h, y_idx.max() + pad)

    cropped = img_rgba.crop((x0, y0, x1, y1))
    cropped.save(output_path, "PNG")
    print(f"Clean logo saved to {output_path} with size {cropped.size}")

if __name__ == '__main__':
    process_logo()

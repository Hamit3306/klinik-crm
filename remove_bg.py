import sys
from PIL import Image

def remove_gray_background(image_path):
    img = Image.open(image_path)
    img = img.convert("RGBA")
    datas = img.getdata()

    newData = []
    for item in datas:
        # Check if the pixel is near-white or light gray (like a checkerboard pattern)
        if item[0] > 180 and item[1] > 180 and item[2] > 180 and max(item[0:3]) - min(item[0:3]) < 40:
            newData.append((255, 255, 255, 0)) # Fully transparent
        else:
            newData.append(item)

    img.putdata(newData)
    img.save(image_path, "PNG")

if __name__ == '__main__':
    remove_gray_background("public/assets/logo.png")

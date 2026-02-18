from fastapi import FastAPI, UploadFile, File
from fastapi.responses import Response
import pytesseract
import cv2
import numpy as np
import os

# WINDOWS TESSERACT PATH
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
os.environ["TESSDATA_PREFIX"] = r"C:\Program Files\Tesseract-OCR\tessdata"

app = FastAPI()

# 🔥 SAFE IMAGE DECODE (RGBA SUPPORT)
def read_image(file_bytes):

    nparr = np.frombuffer(file_bytes, np.uint8)

    img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)

    if img is None:
        raise Exception("Image decode failed")

    # convert RGBA → RGB if needed
    if len(img.shape) == 3 and img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

    return img


# 🔥 OSD AUTO ROTATE
def auto_rotate(img):

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    try:
        osd = pytesseract.image_to_osd(gray, config="--psm 0")
    except:
        return img

    angle = 0

    for line in osd.split("\n"):
        if "Rotate" in line:
            angle = int(line.split(":")[1].strip())
            break

    if angle == 90:
        img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    elif angle == 180:
        img = cv2.rotate(img, cv2.ROTATE_180)
    elif angle == 270:
        img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

    return img


# 🔥 ROTATE API
@app.post("/rotate")
async def rotate(file: UploadFile = File(...)):

    contents = await file.read()

    img = read_image(contents)

    rotated = auto_rotate(img)

    _, png = cv2.imencode(".png", rotated)

    return Response(
        content=png.tobytes(),
        media_type="image/png"
    )

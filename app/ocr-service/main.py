# ocr_api.py
from fastapi import FastAPI, UploadFile
from fastapi.responses import JSONResponse
import cv2
import numpy as np
import pytesseract
import base64

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

app = FastAPI()


def correct_rotation(image: np.ndarray) -> np.ndarray:
    """Automatically detect and correct image rotation."""
    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Use thresholding for better OCR detection
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    # Detect text orientation with pytesseract
    try:
        osd = pytesseract.image_to_osd(thresh)
        rotation = int([line for line in osd.split('\n') if 'Rotate' in line][0].split(':')[1])
    except Exception:
        rotation = 0  # fallback
    
    # Rotate the image to upright
    if rotation != 0:
        (h, w) = image.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, -rotation, 1.0)
        rotated = cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        return rotated
    return image

@app.post("/ocr")
async def ocr(file: UploadFile):
    # Read uploaded PNG into OpenCV
    contents = await file.read()
    np_arr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    # Auto-rotate
    rotated = correct_rotation(image)

    # OCR
    text = pytesseract.image_to_string(rotated, lang='eng')

    # Encode rotated image back to base64 PNG
    _, buffer = cv2.imencode('.png', rotated)
    encoded_image = base64.b64encode(buffer).decode('utf-8')

    return JSONResponse({
        "text": text,
        "image": encoded_image
    })

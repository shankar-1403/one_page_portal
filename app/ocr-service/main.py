# ocr_api.py
import os
from fastapi import FastAPI, UploadFile
from fastapi.responses import JSONResponse
import cv2
import numpy as np
import pytesseract
from pytesseract import Output
import base64
from collections import defaultdict
from paddleocr import PaddleOCR
from paddleocr import PPStructure
import paddle
from bs4 import BeautifulSoup

table_engine = PPStructure(
    show_log=False,
    layout=True,
    table=True,
    ocr=True
)

# Engine location
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# Model location (project)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TESSDATA_DIR = os.path.join(BASE_DIR, "tessdata")

os.environ["TESSDATA_PREFIX"] = TESSDATA_DIR
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["PADDLE_DISABLE_STATIC_OP"] = "1"

app = FastAPI()

paddle.set_device('cpu')

paddle_ocr = PaddleOCR(use_angle_cls=True,lang="en")

def fix_orientation(image: np.ndarray) -> np.ndarray:

    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    osd = pytesseract.image_to_osd(rgb, output_type=Output.DICT)

    angle = osd["rotate"]

    if angle == 0:
        return image

    if angle == 90:
        return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)

    if angle == 180:
        return cv2.rotate(image, cv2.ROTATE_180)

    if angle == 270:
        return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)

    return image

def correct_rotation(image: np.ndarray) -> np.ndarray:

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Edge detect text lines
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)

    # Detect straight lines in document
    lines = cv2.HoughLinesP(
        edges,
        1,
        np.pi / 180,
        threshold=100,
        minLineLength=200,
        maxLineGap=20
    )

    if lines is None:
        return image

    angles = []

    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))

        # Ignore vertical lines
        if -45 < angle < 45:
            angles.append(angle)

    if len(angles) == 0:
        return image

    median_angle = np.median(angles)

    # Rotate image properly
    (h, w) = image.shape[:2]
    center = (w // 2, h // 2)

    M = cv2.getRotationMatrix2D(center, median_angle, 1.0)

    cos = np.abs(M[0, 0])
    sin = np.abs(M[0, 1])

    new_w = int((h * sin) + (w * cos))
    new_h = int((h * cos) + (w * sin))

    M[0, 2] += (new_w / 2) - center[0]
    M[1, 2] += (new_h / 2) - center[1]

    rotated = cv2.warpAffine(
        image,
        M,
        (new_w, new_h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE
    )

    return rotated

def _read_image(contents: bytes) -> np.ndarray:
    """Decode image, handling RGBA from canvas PNG."""
    np_arr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_UNCHANGED)
    if image is None:
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode image")
    if len(image.shape) == 3 and image.shape[2] == 4:
        image = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
    return image


@app.post("/ocr/structured")
async def ocr_structured(file: UploadFile):

    contents = await file.read()

    # ---- Read as PIL ----
    image = _read_image(contents)
    
    image = fix_orientation(image)

    # ---- Rotate (still PIL) ----
    rotated = correct_rotation(image)

    # # ---- Preprocess ----
    gray = cv2.cvtColor(rotated, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3,3), 0)

    processed = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        15
    )

    result = paddle_ocr.ocr(processed)
    table_result = table_engine(processed)

    tables = []
    for block in table_result:
        if block["type"] == "table":
            tables.append(block["res"]["html"])


    structure = []
    full_text = []

    if result and result[0]:
        for line in result[0]:
            coords = line[0] # [[x,y], [x,y], [x,y], [x,y]]
            text = line[1][0]
            conf = float(line[1][1])
            
            full_text.append(text)
            
            # Creating a simplified structure similar to your Tesseract builder
            structure.append({
                "text": text,
                "confidence": conf,
                "box": coords,
            })

    # Return SAME image used for OCR
    _, buffer = cv2.imencode(".png", rotated)
    encoded_image = base64.b64encode(buffer).decode("utf-8")

    return JSONResponse({
        "structure": structure,
        "text": "\n".join(full_text),
        "tables":tables,
        "image":encoded_image
    })
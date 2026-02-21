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

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
os.environ["TESSDATA_PREFIX"] = r"C:\Program Files\Tesseract-OCR\tessdata"

app = FastAPI()


def _ocr_confidence(img: np.ndarray) -> float:
    """Run OCR and return average confidence of detected words. Higher = better orientation."""
    try:
        data = pytesseract.image_to_data(img, lang="eng", output_type=Output.DICT)
        confs = [int(c) for c in data["conf"] if c != "-1" and int(c) > 0]
        return sum(confs) / len(confs) if confs else 0
    except Exception:
        return 0


def correct_rotation(image: np.ndarray) -> np.ndarray:
    """Detect and correct image rotation. Uses OSD first, then fallback to trying all orientations."""
    if len(image.shape) == 3 and image.shape[2] == 4:
        image = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # 1. Try Tesseract OSD
    rotation = 0
    try:
        osd = pytesseract.image_to_osd(gray, config="--psm 0")
        for line in osd.split("\n"):
            if "Rotate" in line:
                rotation = int(line.split(":")[1].strip())
                break
    except Exception:
        pass

    if rotation == 90:
        return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
    if rotation == 180:
        return cv2.rotate(image, cv2.ROTATE_180)
    if rotation == 270:
        return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)

    # 2. Fallback: OSD failed (tables, sparse text). Try all 4 orientations, pick best by OCR confidence
    candidates = [
        (image, "0"),
        (cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE), "90"),
        (cv2.rotate(image, cv2.ROTATE_180), "180"),
        (cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE), "270"),
    ]
    best_img = image
    best_conf = _ocr_confidence(image)
    for img, _ in candidates[1:]:
        conf = _ocr_confidence(img)
        if conf > best_conf:
            best_conf = conf
            best_img = img

    return best_img

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


@app.post("/ocr")
async def ocr(file: UploadFile):
    contents = await file.read()
    image = _read_image(contents)
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


def _build_structure(data: dict) -> list:
    """Build blocks → paragraphs → lines → words hierarchy from Tesseract image_to_data output."""
    n = len(data["text"])
    blocks_map: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))

    for i in range(n):
        text = (data["text"][i] or "").strip()
        if not text:
            continue
        block_num = data["block_num"][i]
        par_num = data["par_num"][i]
        line_num = data["line_num"][i]

        word = {
            "text": text,
            "left": int(data["left"][i]),
            "top": int(data["top"][i]),
            "width": int(data["width"][i]),
            "height": int(data["height"][i]),
            "conf": int(data["conf"][i]) if data["conf"][i] != "-1" else 0,
        }
        blocks_map[block_num][par_num][line_num].append(word)

    # Convert to ordered structure
    result = []
    for block_num in sorted(blocks_map.keys()):
        block_pars = blocks_map[block_num]
        paragraphs = []
        for par_num in sorted(block_pars.keys()):
            par_lines = block_pars[par_num]
            lines = []
            for line_num in sorted(par_lines.keys()):
                words = par_lines[line_num]
                line_text = " ".join(w["text"] for w in words)
                lines.append({
                    "words": words,
                    "text": line_text.strip(),
                })
            par_text = "\n".join(ln["text"] for ln in lines)
            paragraphs.append({
                "lines": lines,
                "text": par_text.strip(),
            })
        block_text = "\n\n".join(p["text"] for p in paragraphs)
        result.append({
            "paragraphs": paragraphs,
            "text": block_text.strip(),
        })

    return result


@app.post("/ocr/structured")
async def ocr_structured(file: UploadFile):
    """Return OCR text in same structure as document: blocks → paragraphs → lines → words."""
    contents = await file.read()
    image = _read_image(contents)
    rotated = correct_rotation(image)

    data = pytesseract.image_to_data(rotated, lang="eng", output_type=Output.DICT)
    structure = _build_structure(data)

    _, buffer = cv2.imencode(".png", rotated)
    encoded_image = base64.b64encode(buffer).decode("utf-8")

    return JSONResponse({
        "structure": structure,
        "text": "\n\n".join(b["text"] for b in structure),
        "image": encoded_image,
    })

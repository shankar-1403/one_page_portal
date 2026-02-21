import "./pdfPollyfill";
import { createCanvas } from "canvas";
import type { Canvas } from "canvas";
import { NodeCanvasFactory } from "./NodeCanvasFactory";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import type {
  DocumentInitParameters,
  RenderParameters,
  PDFPageProxy,
} from "pdfjs-dist/types/src/display/api";

import axios from "axios";
import FormData from "form-data";
import { createWorker } from "tesseract.js";
import sharp from "sharp";

interface NodeDocumentInitParameters extends DocumentInitParameters {
  disableWorker: boolean;
  useWorkerFetch: boolean;
  isEvalSupported: boolean;
  useSystemFonts: boolean;
  nativeImageDecoderSupport: "none";
}

export interface PdfOcrResult {
  image: Buffer;
  text: string;
}

type NodeRenderParameters = RenderParameters & {
  canvasFactory: NodeCanvasFactory;
};

/**
 * Detect rotation using Tesseract.js OSD and straighten the image.
 * Returns the straightened PNG buffer.
 */
async function detectRotationAndStraighten(pngBuffer: Buffer): Promise<Buffer> {
  const worker = await createWorker("eng", 1, { logger: () => {} });
  try {
    const { data } = await worker.detect(pngBuffer);
    const deg = data.orientation_degrees ?? 0;
    if (deg === 0) return pngBuffer;

    // OSD returns current rotation; to straighten we rotate by (360 - deg)
    const rotateDeg = (360 - deg) % 360;
    return sharp(pngBuffer).rotate(rotateDeg).png().toBuffer();
  } catch {
    return pngBuffer; // OSD failed, pass through; Python will also attempt correction
  } finally {
    await worker.terminate();
  }
}

async function pythonOcr(buffer: Buffer): Promise<{
  text: string;
  image: Buffer;
}> {
  const formData = new FormData();
  formData.append("file", buffer, {
    filename: "page.png",
    contentType: "image/png",
  });
  const res = await axios.post(
    "http://127.0.0.1:8000/ocr",
    formData,
    { headers: formData.getHeaders() }
  );
  return {
    text: res.data.text,
    image: Buffer.from(res.data.image, "base64"),
  };
}

export interface OcrWord {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  conf: number;
}

export interface OcrLine {
  words: OcrWord[];
  text: string;
}

export interface OcrParagraph {
  lines: OcrLine[];
  text: string;
}

export interface OcrBlock {
  paragraphs: OcrParagraph[];
  text: string;
}

export interface PdfOcrStructuredResult {
  image: Buffer;
  text: string;
  structure: OcrBlock[];
}

async function pythonOcrStructured(buffer: Buffer): Promise<{
  text: string;
  image: Buffer;
  structure: OcrBlock[];
}> {
  const formData = new FormData();
  formData.append("file", buffer, {
    filename: "page.png",
    contentType: "image/png",
  });
  const res = await axios.post(
    "http://127.0.0.1:8000/ocr/structured",
    formData,
    { headers: formData.getHeaders() }
  );
  return {
    text: res.data.text,
    image: Buffer.from(res.data.image, "base64"),
    structure: res.data.structure,
  };
}


async function renderPdfPageToPng(
  pdfBuffer: Buffer,
  pageNumber: number
): Promise<Buffer> {
  const uint8Array = new Uint8Array(pdfBuffer);
  const params: NodeDocumentInitParameters = {
    data: uint8Array,
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    nativeImageDecoderSupport: "none",
  };
  const loadingTask = pdfjsLib.getDocument(params);
  const pdf = await loadingTask.promise;
  const page: PDFPageProxy = await pdf.getPage(pageNumber);
  const pdfRotation = page.rotate ?? 0;

  // Pass page rotation so pdf.js renders content upright; add 0 for no extra rotation
  const viewport = page.getViewport({
    scale: 4,
    rotation: pdfRotation,
  });

  const canvasFactory = new NodeCanvasFactory();
  const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);

  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  const nodeCanvas = canvas as unknown as Canvas;
  return nodeCanvas.toBuffer("image/png");
}

export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const uint8Array = new Uint8Array(pdfBuffer);
  const params: NodeDocumentInitParameters = {
    data: uint8Array,
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    nativeImageDecoderSupport: "none",
  };
  const loadingTask = pdfjsLib.getDocument(params);
  const pdf = await loadingTask.promise;
  return pdf.numPages;
}

export async function pdfPageToImage(
  pdfBuffer: Buffer,
  pageNumber: number = 1
): Promise<PdfOcrResult> {
  const pngBuffer = await renderPdfPageToPng(pdfBuffer, pageNumber);
  const straightened = await detectRotationAndStraighten(pngBuffer);
  const { text, image } = await pythonOcr(straightened);
  return { image, text };
}

export async function pdfPageToStructuredOcr(
  pdfBuffer: Buffer,
  pageNumber: number = 1
): Promise<PdfOcrStructuredResult> {
  const pngBuffer = await renderPdfPageToPng(pdfBuffer, pageNumber);
  const straightened = await detectRotationAndStraighten(pngBuffer);
  const { text, image, structure } = await pythonOcrStructured(straightened);
  return { image, text, structure };
}

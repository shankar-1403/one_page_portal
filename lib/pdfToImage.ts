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


export async function pdfPageToImage(
  pdfBuffer: Buffer,
  pageNumber: number = 1
): Promise<PdfOcrResult> {

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
  // const normalizedRotation = (360 - pdfRotation) % 360;

  const viewport = page.getViewport({
    scale: 2,
    rotation: 0,
  });

  // radians
  const radians = (pdfRotation * Math.PI) / 180;
  // compute rotated bounding box
  const rotatedWidth = Math.abs(viewport.width * Math.cos(radians)) +
                      Math.abs(viewport.height * Math.sin(radians));
  const rotatedHeight = Math.abs(viewport.width * Math.sin(radians)) +
                        Math.abs(viewport.height * Math.cos(radians));

  const canvasFactory =  new NodeCanvasFactory();
  const { canvas, context } = canvasFactory.create(rotatedWidth, rotatedHeight);

  context.save();
  context.translate(rotatedWidth / 2, rotatedHeight / 2);
  context.rotate(radians);
  context.translate(-viewport.width / 2, -viewport.height / 2);

  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,   
  }).promise;

  context.restore();

  const nodeCanvas = canvas as unknown as Canvas;

  const pngBuffer = nodeCanvas.toBuffer("image/png");

  const {text,image} = await pythonOcr(pngBuffer);

  return {
    image,
    text
  };
}

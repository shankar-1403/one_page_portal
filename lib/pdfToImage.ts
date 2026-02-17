import "./pdfPollyfill";
import { createCanvas,loadImage } from "canvas";
import type { Canvas } from "canvas";
import { NodeCanvasFactory } from "./NodeCanvasFactory";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import type { DocumentInitParameters,RenderParameters,PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import path from "path";
import { createWorker, Worker,PSM, type Lang } from "tesseract.js";

interface NodeDocumentInitParameters extends DocumentInitParameters {
  disableWorker: boolean;
  useWorkerFetch: boolean;
  isEvalSupported: boolean;
  useSystemFonts: boolean;
  nativeImageDecoderSupport: "none";
}

interface OrientationData {
  orientation?: {
    deg: number;
    confidence: number;
  };
}


export interface PdfOcrResult {
  image: Buffer;
  text: string;
}

type NodeRenderParameters = RenderParameters & {
  canvasFactory: NodeCanvasFactory;
};

let worker: Worker | null = null;


async function getWorker(): Promise<Worker> {

    if (worker) return worker;

    worker = await createWorker(["osd"] as unknown as Lang[], 0,{
        workerPath: path.join(
            process.cwd(),
            "node_modules/tesseract.js/src/worker-script/node/index.js"
        ),

        corePath: path.join(
            process.cwd(),
            "node_modules/tesseract.js-core/tesseract-core.wasm.js"
        ),
        langPath: path.join(process.cwd(), "tessdata")
        }
    );

    return worker;
}



async function rotateBufferIfNeeded(
  buffer: Buffer,
  rotation: number
): Promise<Buffer> {

  const normalizedRotation = rotation % 360;

  if (![90, 180, 270].includes(normalizedRotation)) {
    return buffer;
  }

  const img = await loadImage(buffer);

  const rotatedCanvas =
    normalizedRotation === 180
      ? createCanvas(img.width, img.height)
      : createCanvas(img.height, img.width);

  const ctx = rotatedCanvas.getContext("2d");

  ctx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
  ctx.rotate((normalizedRotation * Math.PI) / 180);
  ctx.drawImage(
    img,
    -img.width / 2,
    -img.height / 2
  );

  return rotatedCanvas.toBuffer("image/png");
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
    const page:PDFPageProxy  = await pdf.getPage(pageNumber);

    const pdfRotation = page.rotate ?? 0;

    const normalizedRotation = (360 - pdfRotation) % 360;
    const viewport = page.getViewport({ scale: 2, rotation:normalizedRotation });

    const canvasFactory = new NodeCanvasFactory();

    const { canvas, context } = canvasFactory.create(
        viewport.width,
        viewport.height
    );

    const renderContext: NodeRenderParameters = {
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
        canvasFactory,
    };

    await page.render(renderContext).promise;
    const nodeCanvas = canvas as unknown as Canvas;
    let pngBuffer = nodeCanvas.toBuffer("image/png", {
        resolution: 300,
    });


    const worker = await getWorker();
    await worker.reinitialize(["osd"] as unknown as Lang[]);
    // Detect Rotation
    await worker.setParameters({
        tessedit_pageseg_mode: PSM.OSD_ONLY,
        user_defined_dpi: "300",
        min_characters_to_try: "50"
    });

    const { data } = await worker.detect(pngBuffer);
    const orientation = (data as unknown as OrientationData).orientation;
    console.log("Detected Rotation Degree:", orientation?.deg);
    console.log("Confidence:", orientation?.confidence);
    if (orientation?.deg && orientation.deg !== 0) {

        const autoRotation = (360 - orientation.deg) % 360;
        console.log("Auto Rotating by:", autoRotation);
        pngBuffer = await rotateBufferIfNeeded(
            pngBuffer,
            autoRotation
        );
    }

    await worker.reinitialize(["eng"] as unknown as Lang[]);
    // switch back to ocr
    await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        user_defined_dpi: "300"
    });

    const {
        data: { text },
    } = await worker.recognize(pngBuffer);


    return {
        image: pngBuffer,
        text,
    };
}

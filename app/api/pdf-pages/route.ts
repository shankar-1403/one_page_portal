export const runtime = "nodejs";

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";

(pdfjsLib as unknown as {
  GlobalWorkerOptions: { workerSrc?: string }
}).GlobalWorkerOptions.workerSrc = undefined;

export async function POST(req: Request) {

  const formData = await req.formData();
  const file = formData.get("pdf") as File;

  if (!file) {
    return new Response("No file", { status: 400 });
  }

  const buffer = new Uint8Array(await file.arrayBuffer());

  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  return Response.json({
    totalPages: pdf.numPages,
  });
}

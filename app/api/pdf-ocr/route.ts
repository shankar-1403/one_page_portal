export const runtime = "nodejs";

import { pdfPageToImage } from "@/lib/pdfToImage";

export async function POST(req: Request) {

  try {

    const formData = await req.formData();
    const file = formData.get("pdf") as File;
    const page = Number(formData.get("page")) || 1;

    if (!file) {
      return new Response("No file", { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const { image, text } = await pdfPageToImage(buffer, page);

    return Response.json({
      image: image.toString("base64"),
      text: text,
    });

  } catch (err) {

    console.error("OCR ERROR 👉", err);

    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500 }
    );
  }
}

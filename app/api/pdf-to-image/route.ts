export const runtime = "nodejs";
export const dynamic = "force-dynamic";   

import { pdfPageToImage } from "@/lib/pdfToImage";

export async function POST(req: Request) {
  try {

    const formData = await req.formData();
    const file = formData.get("pdf") as File;
    const page = Number(formData.get("page")) || 1;

    if (!file) {
      return new Response("No file received", { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const { image, text } = await pdfPageToImage(buffer, page);

    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/png",
        "X-OCR-TEXT": encodeURIComponent(text),
      },
    });

  } catch (err) {

    console.error("PDF ERROR ", err);

    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500 }
    );
  }
}

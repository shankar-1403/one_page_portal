export const runtime = "nodejs";

import {
  pdfPageToStructuredOcr,
  getPdfPageCount,
  type OcrBlock,
} from "@/lib/pdfToImage";

export interface PdfPageStructure {
  pageNumber: number;
  blocks: OcrBlock[];
  text: string;
  image?: string;
}

export interface PdfToJsonResult {
  document: {
    totalPages: number;
    filename?: string;
    pages: PdfPageStructure[];
    fullText: string;
  };
}

export async function POST(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const file = formData.get("pdf") as File;
    const includeImages = formData.get("includeImages") !== "false";

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No PDF file received" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const totalPages = await getPdfPageCount(buffer);

    const pages: PdfPageStructure[] = [];
    const fullTextParts: string[] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const { image, text, structure } = await pdfPageToStructuredOcr(
        buffer,
        pageNum
      );

      const pageResult: PdfPageStructure = {
        pageNumber: pageNum,
        blocks: structure,
        text: text.trim(),
      };

      if (includeImages) {
        pageResult.image = image.toString("base64");
      }

      pages.push(pageResult);
      fullTextParts.push(`--- Page ${pageNum} ---\n${text.trim()}`);
    }

    const result: PdfToJsonResult = {
      document: {
        totalPages,
        filename: file.name,
        pages,
        fullText: fullTextParts.join("\n\n"),
      },
    };

    return Response.json(result, {
      headers: {
        "Content-Disposition": `attachment; filename="${file.name.replace(/\.pdf$/i, "")}-extracted.json"`,
      },
    });
  } catch (err) {
    console.error("PDF to JSON error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

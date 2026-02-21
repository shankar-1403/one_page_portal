"use client";

import { useState, useRef } from "react";
import axios from "axios";

async function convertPdfPage(file: File, pageNumber: number): Promise<string> {
  const formData = new FormData();
  formData.append("pdf", file);
  formData.append("page", pageNumber.toString());

  const res = await axios.post("/api/pdf-to-image", formData, { responseType: "blob" });
  const blob = await res.data;
  return URL.createObjectURL(blob);
}

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [jsonExtracting, setJsonExtracting] = useState(false);
  const [jsonResult, setJsonResult] = useState<object | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setJsonResult(null);
    setLoading(true);

    const fd = new FormData();
    fd.append("pdf", file);

    try {
      const pageRes = await axios.post("/api/pdf-pages", fd);
      const { totalPages } = pageRes.data;

      const allImages = await Promise.all(
        Array.from({ length: totalPages }, (_, i) => convertPdfPage(file, i + 1))
      );

      setImageUrl(allImages);
    } catch (err) {
      console.error("Error processing PDF:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExtractToJson = async () => {
    if (!selectedFile) return;

    setJsonExtracting(true);
    setJsonResult(null);

    try {
      const formData = new FormData();
      formData.append("pdf", selectedFile);
      formData.append("includeImages", "true");

      const res = await axios.post("/api/pdf-to-json", formData);
      setJsonResult(res.data);
    } catch (err) {
      console.error("Error extracting to JSON:", err);
      setJsonResult({ error: err instanceof Error ? err.message : "Extraction failed" });
    } finally {
      setJsonExtracting(false);
    }
  };

  const downloadJson = () => {
    if (!jsonResult) return;
    const blob = new Blob([JSON.stringify(jsonResult, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedFile?.name.replace(/\.pdf$/i, "") + "-extracted.json" ?? "extracted.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
      <div className="w-full max-w-3xl p-10 bg-white shadow-lg rounded-xl border border-gray-200 text-center">
        <h1 className="text-2xl font-bold mb-6">Financial Statement PDF → JSON</h1>
        <p className="text-gray-500 mb-4">
          Upload a PDF. Images are straightened first, then text is extracted and mapped.
        </p>

        <label className="cursor-pointer inline-block w-full">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="px-6 py-12 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 transition-colors">
            <p className="text-gray-400">Click or drag your PDF file here</p>
          </div>
        </label>

        {loading && <p className="mt-4 text-blue-500 font-medium">Loading pages...</p>}

        {selectedFile && !loading && (
          <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={handleExtractToJson}
              disabled={jsonExtracting}
              className="px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {jsonExtracting ? "Extracting..." : "Extract to JSON"}
            </button>
          </div>
        )}
      </div>

      {jsonResult && (
        <div className="mt-8 w-full max-w-4xl space-y-8">
          <div className="bg-white shadow-lg rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Straightened pages & mapped text</h2>
            <p className="text-gray-500 text-sm mb-6">
              Images are auto-corrected for rotation before OCR. Extracted text is mapped below each page.
            </p>
            {(() => {
              const doc = (jsonResult as { document?: { pages?: { pageNumber: number; image?: string; blocks?: { paragraphs?: { lines?: { text: string }[] }[] }[] } } }).document;
              if (!doc?.pages) return null;
              return doc.pages.map((page) => (
                <div
                  key={page.pageNumber}
                  className="mb-10 pb-10 border-b border-gray-100 last:border-0 last:pb-0 last:mb-0"
                >
                  <h3 className="text-sm font-medium text-slate-600 mb-3">Page {page.pageNumber}</h3>
                  <div className="flex flex-col lg:flex-col gap-6">
                    <div className="shrink">
                      {page.image && (
                        <img
                          src={`data:image/png;base64,${page.image}`}
                          alt={`Page ${page.pageNumber} (straightened)`}
                          className="max-w-full max-h-96 w-full object-contain shadow rounded-lg border border-gray-200"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-600 mb-2">Extracted structure</div>
                      <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
                        {page.blocks?.map((block, bi) => (
                          <div key={bi} className="space-y-1">
                            {block.paragraphs?.map((para, pi) => (
                              <div key={pi} className="space-y-0.5">
                                {para.lines?.map((line, li) => (
                                  <div key={li} className="text-slate-800">
                                    {line.text}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ));
            })()}
          </div>

          <div className="bg-white shadow-lg rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-3">Raw JSON</h2>
            <div className="flex gap-3 mb-4">
              <button
                type="button"
                onClick={downloadJson}
                className="px-4 py-2 bg-slate-700 text-white text-sm rounded-lg hover:bg-slate-800"
              >
                Download JSON
              </button>
            </div>
            <pre className="p-4 bg-slate-50 rounded-lg overflow-auto max-h-96 text-sm">
              {JSON.stringify(jsonResult, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {imageUrl.length > 0 && (
        <div className="mt-10 w-full grid gap-6">
          <h2 className="text-lg font-semibold">Straightened page preview</h2>
          {imageUrl.map((img, i) => (
            <img
              key={i}
              src={img}
              alt={`page-${i + 1}`}
              className="w-full shadow rounded"
            />
          ))}
        </div>
      )}
    </main>
  );
}

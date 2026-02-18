"use client";

import { useState } from "react";
import axios from "axios";

async function convertPdfPage(file: File, pageNumber: number): Promise<string> {
  const formData = new FormData();
  formData.append("pdf", file);
  formData.append("page", pageNumber.toString());

  // Step 1: Convert PDF page → PNG
  const res = await axios.post("/api/pdf-to-image", formData, { responseType: "blob" });
  
  // Convert blob to URL for image display
  const blob = await res.data;
  return URL.createObjectURL(blob);
}

export default function Home() {
  const [imageUrl, setImageUrl] = useState<string[]>([]);
  const [text, setText] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);

    const fd = new FormData();
    fd.append("pdf", file);

    try {
      const pageRes = await axios.post("/api/pdf-pages", fd);
      const { totalPages } = pageRes.data;

      const allImages = await Promise.all(
        Array.from({ length: totalPages }, (_, i) => convertPdfPage(file, i + 1))
      );

      const textJson = totalPages.text;
      setText(textJson);

      setImageUrl(allImages);
    } catch (err) {
      console.error("Error processing PDF:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
      
      <div className="w-full max-w-xl p-10 bg-white shadow-lg rounded-xl border border-gray-200 text-center">
        <h1 className="text-2xl font-bold mb-6">Upload Your PDF</h1>
        <p className="text-gray-500 mb-4">
          Select a PDF file to convert each page into images.
        </p>

        <label className="cursor-pointer inline-block w-full">
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="px-6 py-12 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 transition-colors">
            <p className="text-gray-400">Click or drag your PDF file here</p>
          </div>
        </label>

        {loading && <p className="mt-4 text-blue-500 font-medium">Processing PDF...</p>}
      </div>

      {imageUrl.length > 0 && (
        <div className="mt-10 w-full grid gap-6">
          {imageUrl.map((img, i) => (
            <img
              key={i}
              src={img}
              alt={`page-${i + 1}`}
              className="w-full shadow"
            />
          ))}
        </div>
      )}
    </main>
  );
}

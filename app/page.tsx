"use client";

import { useState } from "react";
import axios from "axios";

async function convertPdfPage(
  file: File,
  pageNumber: number
): Promise<string> {

  const formData = new FormData();
  formData.append("pdf", file);
  formData.append("page", pageNumber.toString());

  const res = await axios.post('/api/pdf-to-image',
      formData,
      {
        responseType:"blob"
      }
  );

  return URL.createObjectURL(res.data);
}


export default function Home() {
  const [imageUrl, setImageUrl] = useState<string[]>([]);

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {

    const file = e.target.files?.[0];
    if (!file) return;

    const fd = new FormData();
    fd.append("pdf", file);

    const pageRes = await axios.post("/api/pdf-pages", fd);

    const { totalPages } = pageRes.data;

    const allImages = await Promise.all(
      Array.from({ length: totalPages }, (_, i) =>
        convertPdfPage(file, i + 1)
      )
    );

    setImageUrl(allImages);
  };

  return (
    <main className="p-10">
      <input
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
      />

      {imageUrl.map((img, i) => (
        <img
          key={i}
          src={img}
          alt={`page-${i + 1}`}
          className="w-full"
        />
      ))}
    </main>
  );
}

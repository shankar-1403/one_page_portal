import type { NextConfig } from "next";

const nextConfig: NextConfig = {
   experimental: {
    serverComponentsExternalPackages: [
      "pdfjs-dist",
      "canvas",
      "tesseract.js",
      "tesseract.js-core"
    ],
  },

  webpack: (config) => {

    config.externals = [
      ...(config.externals || []),
      {
        "pdfjs-dist": "commonjs pdfjs-dist",
        "canvas": "commonjs canvas",
      },
    ];

    return config;
  },
};

export default nextConfig;

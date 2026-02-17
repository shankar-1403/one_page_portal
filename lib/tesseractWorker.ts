import path from "path";

export const tesseractWorkerPath = path.join(
  process.cwd(),
  "node_modules",
  "tesseract.js",
  "src",
  "worker-script",
  "node",
  "index.js"
);

export const tesseractCorePath = path.join(
  process.cwd(),
  "node_modules",
  "tesseract.js-core",
  "tesseract-core.wasm.js"
);

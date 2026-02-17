import {
  Canvas,
  Image,
  ImageData,
  DOMMatrix,
  CanvasRenderingContext2D,
} from "canvas";

// runtime injection ONLY (no redeclaration)

Object.defineProperty(globalThis, "HTMLCanvasElement", {
  value: Canvas,
  writable: true,
});

Object.defineProperty(globalThis, "HTMLImageElement", {
  value: Image,
  writable: true,
});

Object.defineProperty(globalThis, "CanvasRenderingContext2D", {
  value: CanvasRenderingContext2D,
  writable: true,
});

Object.defineProperty(globalThis, "ImageData", {
  value: ImageData,
  writable: true,
});

Object.defineProperty(globalThis, "DOMMatrix", {
  value: DOMMatrix,
  writable: true,
});

// Path2D not provided by node-canvas
class Path2DPolyfill {}
Object.defineProperty(globalThis, "Path2D", {
  value: Path2DPolyfill,
  writable: true,
});

export {};
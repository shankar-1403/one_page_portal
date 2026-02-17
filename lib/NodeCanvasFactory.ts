import { createCanvas, Canvas } from "canvas";

export class NodeCanvasFactory {

  create(width: number, height: number) {

    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");

    return {
      canvas: canvas as unknown as HTMLCanvasElement,
      context: context as unknown as CanvasRenderingContext2D,
    };
  }

  reset(
    canvasAndContext: {
      canvas: HTMLCanvasElement;
      context: CanvasRenderingContext2D;
    },
    width: number,
    height: number
  ) {

    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(
    canvasAndContext: {
      canvas: HTMLCanvasElement;
      context: CanvasRenderingContext2D;
    }
  ) {

    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

import * as pdfjs from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set worker source to the locally bundled worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function convertPdfToImages(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const imageUrls: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // High scale for better OCR
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) continue;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ 
      canvasContext: context, 
      viewport,
      // @ts-ignore - Some versions might require 'canvas' property or have slightly different types
      canvas: canvas 
    }).promise;
    imageUrls.push(canvas.toDataURL('image/png').split(',')[1]); // Get base64 without prefix
  }

  return imageUrls;
}

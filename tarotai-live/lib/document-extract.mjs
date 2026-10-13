export async function extractPdfText(input) {
  // Import the Node worker setup before PDFParse. In serverless runtimes the
  // PDF.js rendering globals are not browser globals; the worker bundle
  // provides the appropriate Node factory and worker bytes.
  const worker = await import("pdf-parse/worker");
  const { PDFParse } = await import("pdf-parse");
  PDFParse.setWorker(worker.getData());

  const parser = new PDFParse({
    data: new Uint8Array(input),
    CanvasFactory: worker.CanvasFactory
  });

  try {
    const result = await parser.getText();
    return typeof result?.text === "string" ? result.text : "";
  } finally {
    await parser.destroy();
  }
}

export async function extractOfficeText(input) {
  // Keep the Office parser lazy so unrelated document requests and route
  // initialization do not eagerly load PDF.js into the serverless bundle.
  const { getTextExtractor } = await import("office-text-extractor");
  const extractor = getTextExtractor();
  return await extractor.extractText({ input, type: "buffer" });
}

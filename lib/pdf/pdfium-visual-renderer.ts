import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

export type PdfiumVisualRenderer = {
  renderPage: (
    pageIndex: number,
    canvas: HTMLCanvasElement,
    isCancelled?: () => boolean,
  ) => Promise<void>;
  close: () => void;
};

type PdfiumHeapRuntime = WrappedPdfiumModule["pdfium"] & {
  HEAPU8: Uint8Array;
};

let pdfiumModulePromise: Promise<WrappedPdfiumModule> | null = null;

/**
 * Chromium 138/139 regressed CFF FontMatrix transforms produced by PDF.js for
 * embedded Type1 fonts (Chromium issue 428482739 / PDF.js issue 20143).
 * Chromium 140 contains the upstream Fontations fix, so do not pay the WASM
 * rendering cost outside the affected browser window.
 */
export function needsChromiumFontMatrixFallback(userAgent = globalThis.navigator?.userAgent ?? "") {
  const edge = /Edg\/(\d+)/u.exec(userAgent);
  const chrome = /(?:Chrome|Chromium)\/(\d+)/u.exec(userAgent);
  const major = Number((edge ?? chrome)?.[1] ?? Number.NaN);
  return Number.isFinite(major) && major >= 138 && major < 140;
}

export async function createPdfiumVisualRenderer(pdfBytes: Uint8Array): Promise<PdfiumVisualRenderer> {
  const pdfium = await getPdfiumModule();
  const runtime = pdfium.pdfium as PdfiumHeapRuntime;
  const malloc = runtime.wasmExports.malloc;
  const free = runtime.wasmExports.free;
  const filePtr = malloc(pdfBytes.byteLength);
  runtime.HEAPU8.set(pdfBytes, filePtr);

  // @embedpdf/pdfium's generated JS binding marshals the password string to
  // the FPDF_BYTESTRING pointer expected by native PDFium. An empty string is
  // the wrapper-level equivalent of "no password".
  const documentPtr = pdfium.FPDF_LoadMemDocument(filePtr, pdfBytes.byteLength, "");
  if (!documentPtr) {
    const code = pdfium.FPDF_GetLastError();
    free(filePtr);
    throw new Error(`PDFium failed to open PDF (${code})`);
  }

  let closed = false;

  return {
    async renderPage(pageIndex, canvas, isCancelled = () => false) {
      if (closed || isCancelled()) return;
      const pagePtr = pdfium.FPDF_LoadPage(documentPtr, pageIndex);
      if (!pagePtr) throw new Error(`PDFium failed to load page ${pageIndex + 1}`);

      try {
        const pixelWidth = canvas.width;
        const pixelHeight = canvas.height;
        if (pixelWidth < 1 || pixelHeight < 1 || isCancelled()) return;

        const bitmapPtr = pdfium.FPDFBitmap_Create(pixelWidth, pixelHeight, 0);
        if (!bitmapPtr) throw new Error("PDFium failed to create page bitmap");

        try {
          pdfium.FPDFBitmap_FillRect(bitmapPtr, 0, 0, pixelWidth, pixelHeight, 0xffffffff);
          pdfium.FPDF_RenderPageBitmap(
            bitmapPtr,
            pagePtr,
            0,
            0,
            pixelWidth,
            pixelHeight,
            0,
            16,
          );

          if (isCancelled()) return;
          const bufferPtr = pdfium.FPDFBitmap_GetBuffer(bitmapPtr);
          if (!bufferPtr) throw new Error("PDFium failed to expose page bitmap");

          const bufferSize = pixelWidth * pixelHeight * 4;
          const rgba = new Uint8ClampedArray(
            runtime.HEAPU8.buffer,
            runtime.HEAPU8.byteOffset + bufferPtr,
            bufferSize,
          ).slice();
          if (isCancelled()) return;

          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("Canvas context is unavailable");
          context.putImageData(new ImageData(rgba, pixelWidth, pixelHeight), 0, 0);
        } finally {
          pdfium.FPDFBitmap_Destroy(bitmapPtr);
        }
      } finally {
        pdfium.FPDF_ClosePage(pagePtr);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      pdfium.FPDF_CloseDocument(documentPtr);
      free(filePtr);
    },
  };
}

async function getPdfiumModule(): Promise<WrappedPdfiumModule> {
  if (!pdfiumModulePromise) {
    pdfiumModulePromise = (async () => {
      const [{ init }, wasmResponse] = await Promise.all([
        import("@embedpdf/pdfium"),
        fetch("/pdfium.wasm"),
      ]);
      if (!wasmResponse.ok) throw new Error(`Failed to load PDFium WASM (${wasmResponse.status})`);
      const wasmBinary = await wasmResponse.arrayBuffer();
      const pdfium = await init({ wasmBinary });
      pdfium.PDFiumExt_Init();
      return pdfium;
    })();
  }
  return pdfiumModulePromise;
}

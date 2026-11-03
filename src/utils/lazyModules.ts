/**
 * Lazy Module Loader for Heavy Third-Party Libraries
 * Dynamically loads heavy client-side engines on demand so the initial bundle
 * remains lightweight and fast.
 */

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
let docxPromise: Promise<typeof import('docx')> | null = null;
let exceljsPromise: Promise<typeof import('exceljs')> | null = null;
let pptxgenjsPromise: Promise<any> | null = null;
let mammothPromise: Promise<any> | null = null;
let jszipPromise: Promise<any> | null = null;

export async function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const workerUrlModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrlModule.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

export async function getDocx(): Promise<typeof import('docx')> {
  if (!docxPromise) {
    docxPromise = import('docx');
  }
  return docxPromise;
}

export async function getExcelJS(): Promise<typeof import('exceljs')> {
  if (!exceljsPromise) {
    exceljsPromise = (async () => {
      const mod = await import('exceljs');
      return (mod as any).default || mod;
    })();
  }
  return exceljsPromise;
}

export async function getPptxGenJS(): Promise<any> {
  if (!pptxgenjsPromise) {
    pptxgenjsPromise = (async () => {
      const mod = await import('pptxgenjs');
      return (mod as any).default || mod;
    })();
  }
  return pptxgenjsPromise;
}

export async function getMammoth(): Promise<any> {
  if (!mammothPromise) {
    mammothPromise = (async () => {
      const mod = await import('mammoth');
      return (mod as any).default || mod;
    })();
  }
  return mammothPromise;
}

export async function getJSZip(): Promise<any> {
  if (!jszipPromise) {
    jszipPromise = (async () => {
      const mod = await import('jszip');
      return (mod as any).default || mod;
    })();
  }
  return jszipPromise;
}

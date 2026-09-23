// §415 — La build minificata di pdf.js è la stessa libreria, con gli stessi tipi:
// si importa quella perché il webpack di Next 14 non digerisce la build normale
// («Object.defineProperty called on non-object»). Vedi components/shared/PdfViewer.tsx.
declare module 'pdfjs-dist/build/pdf.min.mjs' {
  export * from 'pdfjs-dist'
}

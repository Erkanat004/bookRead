import { cp, mkdir, copyFile, rm } from 'node:fs/promises';
await mkdir('public/pdfjs', { recursive: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(`node_modules/pdfjs-dist/${dir}`, `public/pdfjs/${dir}`, { recursive: true });
}
// Vite now emits the matching worker as an imported URL asset. Remove only our old generated copy.
await rm('public/pdfjs/pdf.worker.min.mjs', { force: true });
await copyFile('node_modules/pdfjs-dist/LICENSE', 'public/pdfjs/LICENSE');
await mkdir('public/licenses', { recursive: true });
await copyFile('node_modules/fflate/LICENSE', 'public/licenses/fflate.txt');
await copyFile('node_modules/@capacitor/core/LICENSE', 'public/licenses/capacitor.txt');

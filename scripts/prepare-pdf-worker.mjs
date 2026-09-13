import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const source = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
const publicDirectory = path.resolve("public");
const destination = path.join(publicDirectory, "pdf.worker.min.mjs");

await mkdir(publicDirectory, { recursive: true });
await copyFile(source, destination);
console.log("Prepared PDF.js worker at public/pdf.worker.min.mjs");

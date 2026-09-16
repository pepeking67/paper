import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const packageRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
const workerSource = path.join(packageRoot, "build", "pdf.worker.min.mjs");
const publicDirectory = path.resolve("public");
const workerDestination = path.join(publicDirectory, "pdf.worker.min.mjs");
const resourceDirectory = path.join(publicDirectory, "pdfjs");
const compatibilityPrefix = `if(typeof Uint8Array.prototype.toHex!=="function"){Object.defineProperty(Uint8Array.prototype,"toHex",{configurable:true,writable:true,value:function(){let hex="";for(const byte of this)hex+=byte.toString(16).padStart(2,"0");return hex}})}if(typeof Map.prototype.getOrInsert!=="function"){Object.defineProperty(Map.prototype,"getOrInsert",{configurable:true,writable:true,value:function(key,value){if(!this.has(key))this.set(key,value);return this.get(key)}})}if(typeof Map.prototype.getOrInsertComputed!=="function"){Object.defineProperty(Map.prototype,"getOrInsertComputed",{configurable:true,writable:true,value:function(key,callback){if(!this.has(key))this.set(key,callback(key));return this.get(key)}})}\n`;

await mkdir(publicDirectory, { recursive: true });
await writeFile(workerDestination, compatibilityPrefix + await readFile(workerSource, "utf8"));

await rm(resourceDirectory, { recursive: true, force: true });
await mkdir(resourceDirectory, { recursive: true });
await Promise.all([
  cp(path.join(packageRoot, "cmaps"), path.join(resourceDirectory, "cmaps"), { recursive: true }),
  cp(path.join(packageRoot, "standard_fonts"), path.join(resourceDirectory, "standard_fonts"), { recursive: true }),
]);

console.log("Prepared PDF.js worker, CMaps, and standard fonts in public/");

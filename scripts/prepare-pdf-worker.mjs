import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const source = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
const publicDirectory = path.resolve("public");
const destination = path.join(publicDirectory, "pdf.worker.min.mjs");
const compatibilityPrefix = `if(typeof Uint8Array.prototype.toHex!=="function"){Object.defineProperty(Uint8Array.prototype,"toHex",{configurable:true,writable:true,value:function(){let hex="";for(const byte of this)hex+=byte.toString(16).padStart(2,"0");return hex}})}if(typeof Map.prototype.getOrInsert!=="function"){Object.defineProperty(Map.prototype,"getOrInsert",{configurable:true,writable:true,value:function(key,value){if(!this.has(key))this.set(key,value);return this.get(key)}})}if(typeof Map.prototype.getOrInsertComputed!=="function"){Object.defineProperty(Map.prototype,"getOrInsertComputed",{configurable:true,writable:true,value:function(key,callback){if(!this.has(key))this.set(key,callback(key));return this.get(key)}})}\n`;

await mkdir(publicDirectory, { recursive: true });
await writeFile(destination, compatibilityPrefix + await readFile(source, "utf8"));
console.log("Prepared PDF.js worker at public/pdf.worker.min.mjs");

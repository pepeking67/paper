type Uint8ArrayWithToHex = Uint8Array & { toHex?: () => string };

/** PDF.js 5 uses the new Uint8Array#toHex API, which older browsers lack. */
export function installUint8ArrayToHex() {
  const prototype = Uint8Array.prototype as Uint8ArrayWithToHex;
  if (typeof prototype.toHex === "function") return;
  Object.defineProperty(prototype, "toHex", {
    configurable: true,
    writable: true,
    value(this: Uint8Array) {
      let hex = "";
      for (const byte of this) hex += byte.toString(16).padStart(2, "0");
      return hex;
    },
  });
}

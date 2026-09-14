type Uint8ArrayWithToHex = Uint8Array & { toHex?: () => string };
type MapWithUpsert = Map<unknown, unknown> & {
  getOrInsert?: (key: unknown, value: unknown) => unknown;
  getOrInsertComputed?: (key: unknown, callback: (key: unknown) => unknown) => unknown;
};

/** Install the recent built-ins used by PDF.js 5 when a browser lacks them. */
export function installPdfJsCompatibility() {
  const prototype = Uint8Array.prototype as Uint8ArrayWithToHex;
  if (typeof prototype.toHex !== "function") {
    Object.defineProperty(prototype, "toHex", {
      configurable: true, writable: true,
      value(this: Uint8Array) {
        let hex = "";
        for (const byte of this) hex += byte.toString(16).padStart(2, "0");
        return hex;
      },
    });
  }

  const mapPrototype = Map.prototype as MapWithUpsert;
  if (typeof mapPrototype.getOrInsert !== "function") {
    Object.defineProperty(mapPrototype, "getOrInsert", {
      configurable: true, writable: true,
      value(this: Map<unknown, unknown>, key: unknown, value: unknown) {
        if (!this.has(key)) this.set(key, value);
        return this.get(key);
      },
    });
  }
  if (typeof mapPrototype.getOrInsertComputed !== "function") {
    Object.defineProperty(mapPrototype, "getOrInsertComputed", {
      configurable: true, writable: true,
      value(this: Map<unknown, unknown>, key: unknown, callback: (key: unknown) => unknown) {
        if (!this.has(key)) this.set(key, callback(key));
        return this.get(key);
      },
    });
  }
}

export const installUint8ArrayToHex = installPdfJsCompatibility;

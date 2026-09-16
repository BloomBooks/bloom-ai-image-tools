/// <reference types="vite-plus/client" />

/** The package version, baked in at build time (see vite.config.ts). */
declare const __APP_VERSION__: string;

declare module "*.json5" {
  const content: string;
  export default content;
}

// gifenc ships no type declarations; declare the members we use.
declare module "gifenc" {
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, options?: unknown): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
    bytesView(): Uint8Array<ArrayBuffer>;
  };
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: unknown,
  ): number[][];
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: string,
  ): Uint8Array;
}

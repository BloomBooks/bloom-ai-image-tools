/// <reference types="vite-plus/client" />

declare module "*.json5" {
  const content: string;
  export default content;
}

declare module "png-chunks-extract" {
  const extractPngChunks: (data: Uint8Array) => Array<{ name: string; data: Uint8Array }>;
  export default extractPngChunks;
}

declare module "png-chunks-encode" {
  const encodePngChunks: (chunks: Array<{ name: string; data: Uint8Array }>) => Uint8Array;
  export default encodePngChunks;
}

declare module "piexifjs" {
  const piexif: any;
  export default piexif;
}

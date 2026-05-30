/// <reference types="vite-plus/client" />

declare module "*.json5" {
  const content: string;
  export default content;
}

declare module "gifenc" {
  export function GIFEncoder(): any;
  export function quantize(...args: any[]): any;
  export function applyPalette(...args: any[]): any;
}

/// <reference types="vite-plus/client" />

declare module "*.json5" {
  const content: string;
  export default content;
}

/// <reference types="vite/client" />

declare module "*.json5" {
  const content: string;
  export default content;
}

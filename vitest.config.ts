import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "lib/__tests__/**/*.test.ts",
      "services/**/__tests__/**/*.test.ts",
    ],
  },
});

import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname),
      "@shared": resolve(__dirname, "shared"),
    },
  },
  test: {
    environment: "node",
  },
});
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Fast, no database: tests cover pure logic (permissions, contract rules,
// season transitions, service record, recurrence). Anything that needs
// Prisma takes the client as an argument or is left to the type checker.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts", "prisma/**/*.test.ts"], environment: "node" },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["**/*.test.{js,ts}"],
        globals: true,
        testTimeout: 60_000
    }
});

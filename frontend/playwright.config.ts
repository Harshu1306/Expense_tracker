import { defineConfig, devices } from "@playwright/test";

// Dedicated ports keep E2E runs isolated from a developer's `npm run dev`
// server on :3000 and a manually started API on :8000.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const apiURL = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:8100";
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  timeout: 75_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: skipWebServer
    ? undefined
    : [
        {
          command:
            "..\\.venv\\Scripts\\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8100",
          cwd: "../backend",
          url: `${apiURL}/api/health`,
          reuseExistingServer: false,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
          env: {
            SPENDWISE_DB_PATH: "e2e.db",
            SPENDWISE_CORS_ORIGINS:
              "http://127.0.0.1:3100,http://localhost:3100",
          },
        },
        {
          command: "npm run build && npm run start -- --port 3100",
          cwd: ".",
          url: baseURL,
          reuseExistingServer: false,
          timeout: 300_000,
          env: {
            NEXT_PUBLIC_API_URL: apiURL,
          },
        },
      ],
});

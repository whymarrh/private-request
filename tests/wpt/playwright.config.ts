import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  retries: 1,
  outputDir: "./results",
  reporter: [
    ["list", { printSteps: true }],
    ["html", { outputFolder: "./report", open: "never" }],
    ["json", { outputFile: "./results/results.json" }],
  ],
  timeout: 60_000,
  use: {
    baseURL: "https://wpt.live",
    trace: "retain-on-failure",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  retries: Number.parseInt(process.env["WPT_RETRIES"] ?? "3", 10),
  outputDir: "./results",
  reporter: [
    ["list", { printSteps: false }],
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

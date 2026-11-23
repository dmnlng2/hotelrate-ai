"use strict";

const { defineConfig } = require("@playwright/test");

const host = "127.0.0.1";
const port = 4173;
const baseURL = `http://${host}:${port}`;

module.exports = defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  use: { baseURL, browserName: "chromium" },
  webServer: {
    command: `node tests/serve.js ${host} ${port}`,
    url: baseURL
  }
});

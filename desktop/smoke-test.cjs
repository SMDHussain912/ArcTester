"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const indexHtml = path.join(root, "web", "dist", "index.html");

let failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(fs.existsSync(indexHtml), "web/dist/index.html must exist (build the web app first)");

const html = fs.readFileSync(indexHtml, "utf8");

// Packaged Electron loads the file via the file:// protocol, so asset URLs must
// be relative to index.html. Absolute /assets/... URLs would resolve against the
// filesystem root and 404, leaving a blank window.
check(!/src="\/assets\//.test(html), "index.html must not reference absolute /assets/ scripts");
check(!/href="\/assets\//.test(html), "index.html must not reference absolute /assets/ stylesheets");
check(/src="\.\/assets\//.test(html), "index.html must reference relative ./assets/ scripts");
check(/href="\.\/assets\//.test(html), "index.html must reference relative ./assets/ stylesheets");

const assetsDir = path.join(root, "web", "dist", "assets");
check(fs.existsSync(assetsDir) && fs.readdirSync(assetsDir).length > 0, "web/dist/assets must contain built assets");

if (failures.length > 0) {
  console.error("Desktop smoke test failed:");
  for (const failure of failures) console.error(" -", failure);
  process.exit(1);
}
console.log("Desktop smoke test passed: packaged index loads under file://");

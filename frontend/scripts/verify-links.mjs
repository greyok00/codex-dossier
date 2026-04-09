#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const routingFile = path.resolve(process.cwd(), "src/lib/local-routing.ts");
const source = await fs.readFile(routingFile, "utf8");

const staticUrls = new Set();
for (const match of source.matchAll(/https:\/\/[^\s"'`),}]+/g)) {
  const candidate = match[0];
  if (candidate.includes("${")) {
    continue;
  }
  staticUrls.add(candidate);
}

const dynamicGoogleRoutes = [
  "https://www.google.com/search?q=phoenix+az+police+department+non-emergency+report",
  "https://www.google.com/search?q=tx+police+department+non-emergency+report",
];
for (const url of dynamicGoogleRoutes) {
  staticUrls.add(url);
}

const urls = [...staticUrls].sort((a, b) => a.localeCompare(b));
if (urls.length === 0) {
  console.error("No URLs found in local-routing.ts");
  process.exit(1);
}

const timeoutMs = 12000;
const results = [];

for (const url of urls) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response;
    try {
      response = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
      });
    } catch {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
    }

    results.push({
      url,
      ok: response.ok || response.status === 403,
      warning: !response.ok && response.status === 403 ? "reachable_but_blocked" : null,
      status: response.status,
      finalUrl: response.url,
    });
  } catch (error) {
    results.push({
      url,
      ok: false,
      status: 0,
      finalUrl: null,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timer);
  }
}

let failures = 0;
for (const item of results) {
  if (!item.ok) {
    failures += 1;
  }
  const status = item.status === 0 ? "ERR" : String(item.status);
  const mark = item.warning ? "WARN" : item.ok ? "PASS" : "FAIL";
  const finalSuffix = item.finalUrl && item.finalUrl !== item.url ? ` -> ${item.finalUrl}` : "";
  const errorSuffix = item.error ? ` (${item.error})` : "";
  const warningSuffix = item.warning ? " (reachable but blocked for automated checks)" : "";
  console.log(`${mark} [${status}] ${item.url}${finalSuffix}${warningSuffix}${errorSuffix}`);
}

if (failures > 0) {
  console.error(`\nLink verification failed: ${failures}/${results.length} URLs did not pass.`);
  process.exit(1);
}

console.log(`\nLink verification passed: ${results.length}/${results.length} URLs are reachable.`);

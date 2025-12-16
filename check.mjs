import fs from "node:fs";

const URL = "https://www.spotlite.co.kr/jiujitsu/313/participations/";

function normalize(s) {
  return (s || "").trim().replace(/\s+/g, " ");
}

const inputNames = new Set(
  fs.readFileSync("names.txt", "utf8")
    .split("\n")
    .map(normalize)
    .filter(Boolean)
);

import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(URL, { waitUntil: "networkidle" });

// Wait until the loading message is gone OR rows exist
await page.waitForTimeout(1500);

// Try a few common table row patterns (Spotlite pages render a table of participants)
await page.waitForFunction(() => {
  const text = document.body?.innerText || "";
  const hasRows = document.querySelectorAll("table tbody tr").length > 0;
  return hasRows || !text.includes("잠시만 기다려주세요");
}, { timeout: 30000 });

// Grab all row texts and extract the "선수 이름" column.
// If the table has fixed columns, name is usually in the 3rd/4th column.
// We'll collect all cells and pick the one that looks like a Korean name.
const participantNames = await page.evaluate(() => {
  const norm = (s) => (s || "").trim().replace(/\s+/g, " ");
  const rows = Array.from(document.querySelectorAll("table tbody tr"));

  const names = [];
  for (const row of rows) {
    const tds = Array.from(row.querySelectorAll("td")).map(td => norm(td.textContent));
    // Heuristic: Korean names are often 2–4 Hangul chars (sometimes with spaces)
    // We also allow middle dots or hyphens just in case.
    const candidate = tds.find(v => /^[가-힣\s·-]{2,8}$/.test(v));
    if (candidate) names.push(candidate);
  }
  return Array.from(new Set(names));
});

await browser.close();

// Compare
const out = [];
out.push("name,found");
for (const name of inputNames) {
  const found = participantNames.includes(name) ? "YES" : "NO";
  out.push(`${name},${found}`);
}

fs.writeFileSync("results.csv", out.join("\n"), "utf8");
console.log(`Checked ${inputNames.size} names vs ${participantNames.length} participants`);

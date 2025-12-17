import fs from "node:fs";
import { chromium } from "playwright";

const PAGE_URL = "https://www.spotlite.co.kr/jiujitsu/313/participations/";
const API_PATH = "/jiujitsu/313/api/participation_list/";

function canon(s) {
  return (s || "").trim().replace(/\s+/g, "");
}

const rawLines = fs.readFileSync("names.txt", "utf8").split("\n");
const input = rawLines.map(canon).filter(Boolean);
const inputSet = new Set(input);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

let apiText = null;

// Listen for the exact API response the page uses
page.on("response", async (res) => {
  try {
    const url = res.url();
    if (!url.includes(API_PATH)) return;
    // Grab raw text (works even if server labels it text/html)
    apiText = await res.text();
  } catch {}
});

await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });

// If the page triggers the API call a bit later, give it time
for (let i = 0; i < 20 && !apiText; i++) {
  await page.waitForTimeout(500);
}

await browser.close();

if (!apiText) {
  throw new Error("Did not capture participation_list API response. Site may be blocking automation.");
}

// Parse JSON (and fail loudly with a snippet if it isn't JSON)
let data;
try {
  data = JSON.parse(apiText);
} catch (e) {
  console.log("Captured API response (first 400 chars):");
  console.log(apiText.slice(0, 400));
  throw new Error("Captured participation_list response was not JSON.");
}

// Handle either array or paginated {results: [...]}
const records = Array.isArray(data) ? data : (data.results || []);

const matches = new Set();

// Walk records and only accept strings that match your input list (prevents false positives)
function walk(obj) {
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (cur == null) continue;

    if (typeof cur === "string") {
      const c = canon(cur);
      if (inputSet.has(c)) matches.add(c);
      continue;
    }
    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
      continue;
    }
    if (typeof cur === "object") {
      for (const v of Object.values(cur)) stack.push(v);
    }
  }
}

for (const r of records) walk(r);

console.log(`Records seen: ${records.length}`);
console.log(`Matched names: ${matches.size}`);

const out = ["name,found"];
for (const line of rawLines) {
  const c = canon(line);
  if (!c) continue;
  out.push(`${line.trim()},${matches.has(c) ? "YES" : "NO"}`);
}
fs.writeFileSync("results.csv", out.join("\n"), "utf8");

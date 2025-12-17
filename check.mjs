import fs from "node:fs";
import { chromium } from "playwright";

const URL = "https://www.spotlite.co.kr/jiujitsu/313/participations/";

function normalize(s) {
  return (s || "").trim().replace(/\s+/g, " ");
}

const inputNames = fs
  .readFileSync("names.txt", "utf8")
  .split("\n")
  .map(normalize)
  .filter(Boolean);

const inputSet = new Set(inputNames);

// Extract any Korean-name-looking strings from arbitrary JSON
function extractKoreanNamesFromJson(obj, outSet) {
  const nameLike = /^[가-힣]{2,4}$/; // tweak if needed
  const stack = [obj];

  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;

    if (typeof cur === "string") {
      const s = normalize(cur);
      if (nameLike.test(s)) outSet.add(s);
      continue;
    }

    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
      continue;
    }

    if (typeof cur === "object") {
      for (const k of Object.keys(cur)) stack.push(cur[k]);
    }
  }
}

const foundNames = new Set();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// IMPORTANT: do NOT use networkidle on SPAs like this
page.on("response", async (res) => {
  try {
    const ct = (res.headers()["content-type"] || "").toLowerCase();
    if (!ct.includes("application/json")) return;

    const json = await res.json();
    extractKoreanNamesFromJson(json, foundNames);
  } catch {
    // ignore non-JSON / parse errors
  }
});

await page.goto(URL, { waitUntil: "domcontentloaded" });

// give the app time to fetch initial data
await page.waitForTimeout(5000);

// scroll a few times in case it lazy-loads more participants
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(1200);
}

await browser.close();

// Now compare
const lines = ["name,found"];
for (const name of inputNames) {
  lines.push(`${name},${foundNames.has(name) ? "YES" : "NO"}`);
}

fs.writeFileSync("results.csv", lines.join("\n"), "utf8");

// Helpful debug output in the Actions log
console.log(`Collected candidate names from JSON: ${foundNames.size}`);
console.log(`Input names: ${inputNames.length}`);

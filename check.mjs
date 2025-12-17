import fs from "node:fs";
import { chromium } from "playwright";

const URL = "https://www.spotlite.co.kr/jiujitsu/313/participations/";

function norm(s) {
  return (s || "").trim().replace(/\s+/g, " ");
}

// Canonical form for matching: remove spaces + middle dot + hyphen
function canon(s) {
  return norm(s).replace(/[ \t·\-]/g, "");
}

const inputNames = fs
  .readFileSync("names.txt", "utf8")
  .split("\n")
  .map(norm)
  .filter(Boolean);

const inputCanonToOriginals = new Map(); // canon -> [originals]
for (const n of inputNames) {
  const c = canon(n);
  if (!inputCanonToOriginals.has(c)) inputCanonToOriginals.set(c, []);
  inputCanonToOriginals.get(c).push(n);
}

const found = new Set(); // store canonical names found

// Key filters to reduce false positives
function isPlayerNameKey(key) {
  const k = (key || "").toString().toLowerCase();
  // positive signals
  const good =
    k.includes("player") ||
    k.includes("athlete") ||
    k.includes("competitor") ||
    k.includes("participant") ||
    k.includes("선수") ||
    k.includes("참가자");

  // negative signals (coach/instructor)
  const bad =
    k.includes("coach") ||
    k.includes("instructor") ||
    k.includes("지도자") ||
    k.includes("코치");

  return good && !bad;
}

function walk(obj, parentKey = "") {
  if (obj == null) return;

  if (typeof obj === "string") {
    // Only accept string matches when parentKey looks like a player-name field
    if (isPlayerNameKey(parentKey)) {
      const c = canon(obj);
      if (inputCanonToOriginals.has(c)) found.add(c);
    }
    return;
  }

  if (Array.isArray(obj)) {
    for (const v of obj) walk(v, parentKey);
    return;
  }

  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      walk(v, k);
    }
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on("response", async (res) => {
  try {
    // Some sites label JSON as text/plain; try parsing anyway for likely API URLs
    const url = res.url();
    const ct = (res.headers()["content-type"] || "").toLowerCase();
    const looksJson = ct.includes("json") || url.includes("/api") || url.includes("particip") || url.includes("list");

    if (!looksJson) return;

    const text = await res.text();
    if (!text || text.length < 2) return;

    // Try JSON parse
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return;
    }

    walk(json, "");
  } catch {
    // ignore
  }
});

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);

// Scroll a bit to trigger lazy loading if any
for (let i = 0; i < 10; i++) {
  await page.mouse.wheel(0, 2500);
  await page.waitForTimeout(1200);
}

await browser.close();

// Write results (using original input order)
const lines = ["name,found"];
for (const n of inputNames) {
  const yes = found.has(canon(n)) ? "YES" : "NO";
  lines.push(`${n},${yes}`);
}
fs.writeFileSync("results.csv", lines.join("\n"), "utf8");

console.log(`Input names: ${inputNames.length}`);
console.log(`Matched (canonical) names found: ${found.size}`);

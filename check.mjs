import fs from "node:fs";

const API_URL = "https://www.spotlite.co.kr/jiujitsu/313/api/participation_list/";
const REFERER = "https://www.spotlite.co.kr/jiujitsu/313/participations/";

function norm(s) {
  return (s || "").trim().replace(/\s+/g, ""); // remove all whitespace
}

const rawLines = fs.readFileSync("names.txt", "utf8").split("\n");
const inputCanon = rawLines.map(norm).filter(Boolean);
const inputSet = new Set(inputCanon);

// Fetch all pages (supports DRF-style {results, next})
async function fetchAll(url) {
  const all = [];
  let next = url;

  while (next) {
    const res = await fetch(next, {
      headers: {
        "Accept": "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": REFERER,
        "User-Agent": "Mozilla/5.0"
      }
    });

    const text = await res.text();

    // Try JSON parse; if it isn't JSON, print a snippet and fail clearly
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.log("Non-JSON response snippet (first 300 chars):");
      console.log(text.slice(0, 300));
      throw new Error(`API did not return JSON (status ${res.status}).`);
    }

    if (Array.isArray(data)) {
      all.push(...data);
      next = null;
    } else {
      if (Array.isArray(data.results)) all.push(...data.results);
      next = data.next || null;
    }
  }

  return all;
}

// Walk each record and only collect strings that match your input names
function collectMatchesFromRecord(rec, matches) {
  const stack = [rec];
  while (stack.length) {
    const cur = stack.pop();
    if (cur == null) continue;

    if (typeof cur === "string") {
      const c = norm(cur);
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

const records = await fetchAll(API_URL);

const matches = new Set();
for (const r of records) collectMatchesFromRecord(r, matches);

console.log(`API records fetched: ${records.length}`);
console.log(`Matched names found: ${matches.size}`);

// Output CSV preserving your original formatting per line
const out = ["name,found"];
for (const line of rawLines) {
  const c = norm(line);
  if (!c) continue;
  out.push(`${line.trim()},${matches.has(c) ? "YES" : "NO"}`);
}
fs.writeFileSync("results.csv", out.join("\n"), "utf8");

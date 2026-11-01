// scripts/failure-scenarios.js
// รัน: npm run test:failure
// จำลองความล้มเหลวของ API ภายนอก 5 สถานการณ์ แล้วเรียก getMovieExternalInfo() จริง
// สังเกตจำนวนครั้งที่ยิง (นับที่ mock server), delay ของ backoff, ข้อความ error และผลลัพธ์ที่ได้
// จากนั้นเขียนผลที่ "วัดได้จริง" ลงไฟล์ failure-scenario-results.md (ทับไฟล์เดิม)

const http = require("http");
const fs = require("fs");
const path = require("path");
const { getMovieExternalInfo } = require("../src/services/movie-info-service");

const MOVIE = { id: 1, title: "Inception", releaseYear: 2010 };
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;

const OK_BODY = JSON.stringify({
  resultCount: 1,
  results: [
    {
      trackName: "Inception",
      releaseDate: "2010-07-16T07:00:00Z",
      primaryGenreName: "Sci-Fi & Fantasy",
      contentAdvisoryRating: "PG-13",
      longDescription: "mock description",
      artworkUrl100: "http://localhost/mock.jpg",
    },
  ],
});

// mock server: handler(hitNumber, req, res)
function startMock(handler) {
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits += 1;
    handler(hits, req, res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        hits: () => hits,
        close: () => {
          server.closeAllConnections?.();
          return new Promise((r) => server.close(r));
        },
      }),
    );
  });
}

async function runScenario(def) {
  const mock = def.handler ? await startMock(def.handler) : null;
  process.env.EXTERNAL_API_BASE_URL = def.baseUrl ? def.baseUrl : mock.url;

  const retries = [];
  const started = Date.now();
  const result = await getMovieExternalInfo(MOVIE, {
    timeoutMs: def.timeoutMs,
    maxRetries: MAX_RETRIES,
    baseDelayMs: BASE_DELAY_MS,
    onRetry: (info) => retries.push(info),
    log: null, // ไม่ log ซ้ำ (ผลสรุปแสดงด้านล่าง)
  });
  const elapsedMs = Date.now() - started;
  const hits = mock ? mock.hits() : null;
  if (mock) await mock.close();

  const checks = def.verify({ result, retries, hits });
  return { def, result, retries, hits, elapsedMs, pass: checks.every((c) => c.ok), checks };
}

const scenarios = [
  {
    name: "Network error (โดเมนไม่มีอยู่จริง)",
    how: "ตั้ง EXTERNAL_API_BASE_URL เป็น http://this-domain-does-not-exist-12345.invalid",
    expected: "retry 2 ครั้ง (backoff ~0.5-1s, ~1-2s) แล้ว fallback",
    baseUrl: "http://this-domain-does-not-exist-12345.invalid",
    timeoutMs: 3000,
    verify: ({ result, retries }) => [
      { ok: retries.length === MAX_RETRIES, text: `retry ${retries.length} ครั้ง (ต้องเท่ากับ ${MAX_RETRIES})` },
      { ok: result.source === "fallback" && result.available === false, text: `source=${result.source}, available=${result.available}` },
    ],
  },
  {
    name: "Timeout",
    how: "mock server หน่วงตอบ 5 วินาที แต่ตั้ง timeoutMs = 500",
    expected: "ครบ 500ms จึงถือว่าล้มเหลว (ECONNABORTED) → retry 2 ครั้ง → fallback",
    timeoutMs: 500,
    handler: (hit, req, res) => {
      setTimeout(() => {
        if (!res.writableEnded) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(OK_BODY);
        }
      }, 5000).unref();
    },
    verify: ({ result, retries, hits }) => [
      { ok: hits === MAX_RETRIES + 1, text: `mock server ได้รับ request ${hits} ครั้ง (ต้องเท่ากับ ${MAX_RETRIES + 1})` },
      { ok: retries.every((r) => /timeout/i.test(r.message)), text: "ข้อความ error ทุกครั้งเป็น timeout" },
      { ok: result.source === "fallback", text: `source=${result.source}` },
    ],
  },
  {
    name: "External API คืน 500",
    how: "mock server ตอบ 500 ทุกครั้ง",
    expected: "retry เพราะเป็น 5xx รวม 3 request แล้ว fallback",
    timeoutMs: 3000,
    handler: (hit, req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "simulated server error" }));
    },
    verify: ({ result, retries, hits }) => [
      { ok: hits === MAX_RETRIES + 1, text: `mock server ได้รับ request ${hits} ครั้ง (ต้องเท่ากับ ${MAX_RETRIES + 1})` },
      { ok: retries.every((r) => r.status === 500), text: "ทุกครั้งที่ retry ได้ status 500" },
      { ok: result.source === "fallback", text: `source=${result.source}` },
    ],
  },
  {
    name: "External API คืน 404 (ไม่ควร retry)",
    how: "mock server ตอบ 404",
    expected: "4xx ไม่ใช่ความล้มเหลวชั่วคราว → ไม่ retry (ยิงครั้งเดียว) แล้ว fallback",
    timeoutMs: 3000,
    handler: (hit, req, res) => {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    },
    verify: ({ result, retries, hits }) => [
      { ok: hits === 1, text: `mock server ได้รับ request ${hits} ครั้ง (ต้องเท่ากับ 1)` },
      { ok: retries.length === 0, text: `retry ${retries.length} ครั้ง (ต้องเป็น 0)` },
      { ok: result.source === "fallback", text: `source=${result.source}` },
    ],
  },
  {
    name: "ล้มเหลวชั่วคราวแล้วกลับมาปกติ",
    how: "mock server ตอบ 500 ครั้งแรก แล้วตอบ 200 ครั้งที่ 2",
    expected: "retry 1 ครั้งแล้วสำเร็จ ได้ source: external (ไม่ใช้ fallback)",
    timeoutMs: 3000,
    handler: (hit, req, res) => {
      if (hit === 1) {
        res.writeHead(500);
        return res.end();
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(OK_BODY);
    },
    verify: ({ result, retries, hits }) => [
      { ok: hits === 2, text: `mock server ได้รับ request ${hits} ครั้ง (ต้องเท่ากับ 2)` },
      { ok: retries.length === 1, text: `retry ${retries.length} ครั้ง (ต้องเป็น 1)` },
      { ok: result.source === "external" && result.available === true, text: `source=${result.source}, available=${result.available}` },
    ],
  },
];

function describeActual(r) {
  const delays = r.retries.map((x) => `${x.delayMs}ms`).join(", ") || "-";
  const errs = [...new Set(r.retries.map((x) => x.message))].join(" / ") || "-";
  const hitsText = r.hits === null ? "" : `, mock ได้รับ ${r.hits} request`;
  return `retry ${r.retries.length} ครั้ง (delay: ${delays})${hitsText}; error: ${errs}; ผลลัพธ์ source=${r.result.source}; ใช้เวลารวม ${(r.elapsedMs / 1000).toFixed(1)}s`;
}

(async () => {
  const origError = console.error;
  console.error = () => {}; // service log error ตอน fallback — ปิดไว้ให้ผลสรุปอ่านง่าย
  const results = [];
  for (const s of scenarios) {
    process.stdout.write(`▶ ${s.name} ... `);
    const r = await runScenario(s);
    results.push(r);
    console.log(r.pass ? "ผ่าน" : "ไม่ผ่าน");
    r.checks.forEach((c) => console.log(`   ${c.ok ? "✔" : "✘"} ${c.text}`));
  }
  console.error = origError;

  const now = new Date();
  const lines = [];
  lines.push("# บันทึกผลการทดสอบ Failure Scenario");
  lines.push("");
  lines.push(`- สร้างโดย \`npm run test:failure\` (scripts/failure-scenarios.js) เมื่อ ${now.toISOString()}`);
  lines.push(`- Node.js ${process.version} บน ${process.platform}`);
  lines.push(`- การตั้งค่าที่ใช้: maxRetries = ${MAX_RETRIES}, baseDelayMs = ${BASE_DELAY_MS} (backoff แบบ Equal Jitter: ครั้งที่ 1 ≈ 500-1000ms, ครั้งที่ 2 ≈ 1000-2000ms), timeout ปกติ = 3000ms`);
  lines.push("- ฟีเจอร์ที่ทดสอบ: `GET /api/v1/movies/:id/external-info` (เรียก iTunes Search API) ผ่านฟังก์ชัน `getMovieExternalInfo()` ซึ่งเรียก `fetchWithRetry()` ใน `src/services/external-api.js`");
  lines.push("");
  lines.push("| สถานการณ์ | วิธีจำลอง | ผลลัพธ์ที่คาดหวัง | ผลลัพธ์จริง | ผ่าน/ไม่ผ่าน |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const r of results) {
    lines.push(`| ${r.def.name} | ${r.def.how} | ${r.def.expected} | ${describeActual(r)} | ${r.pass ? "ผ่าน" : "ไม่ผ่าน"} |`);
  }
  lines.push("");
  lines.push("## รายละเอียดการตรวจสอบ");
  for (const r of results) {
    lines.push("");
    lines.push(`### ${r.def.name}`);
    r.checks.forEach((c) => lines.push(`- ${c.ok ? "ผ่าน" : "ไม่ผ่าน"}: ${c.text}`));
    r.retries.forEach((x) =>
      lines.push(`- log retry ครั้งที่ ${x.attempt}/${x.maxRetries}: ${x.message} → รอ ${x.delayMs}ms`),
    );
  }
  lines.push("");
  lines.push("## ข้อสรุป");
  const passed = results.filter((r) => r.pass).length;
  lines.push(`ผ่าน ${passed}/${results.length} สถานการณ์ — ทุกสถานการณ์ระบบตอบกลับด้วย response ที่มีความหมาย (external หรือ fallback) ไม่ค้างและไม่ crash`);
  lines.push("");
  lines.push("## ทดสอบผ่าน HTTP จริง (ทำด้วยมือ)");
  lines.push("เปิดเซิร์ฟเวอร์ด้วยตัวแปรแวดล้อมแล้วเรียก `GET /api/v1/movies/1/external-info` ใน Postman:");
  lines.push("");
  lines.push("```bash");
  lines.push("EXTERNAL_API_BASE_URL=http://this-domain-does-not-exist-12345.invalid npm start   # network error");
  lines.push("EXTERNAL_API_TIMEOUT_MS=1 npm start                                              # timeout");
  lines.push("```");
  lines.push("");
  lines.push("ผลที่ต้องได้คือ status 200, `externalInfo.source = \"fallback\"` และเห็น log `[external-api] ... (attempt 1/2)`, `(attempt 2/2)` ใน terminal");

  fs.writeFileSync(path.join(__dirname, "..", "failure-scenario-results.md"), lines.join("\n") + "\n", "utf8");
  console.log(`\nผ่าน ${passed}/${results.length} — บันทึกผลที่ failure-scenario-results.md`);
  process.exit(passed === results.length ? 0 : 1);
})();

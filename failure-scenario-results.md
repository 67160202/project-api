# บันทึกผลการทดสอบ Failure Scenario

- สร้างโดย `npm run test:failure` (scripts/failure-scenarios.js) เมื่อ 2026-10-12T12:02:33.184Z
- Node.js v24.11.1 บน win32
- การตั้งค่าที่ใช้: maxRetries = 2, baseDelayMs = 1000 (backoff แบบ Equal Jitter: ครั้งที่ 1 ≈ 500-1000ms, ครั้งที่ 2 ≈ 1000-2000ms), timeout ปกติ = 3000ms
- ฟีเจอร์ที่ทดสอบ: `GET /api/v1/movies/:id/external-info` (เรียก iTunes Search API) ผ่านฟังก์ชัน `getMovieExternalInfo()` ซึ่งเรียก `fetchWithRetry()` ใน `src/services/external-api.js`

| สถานการณ์ | วิธีจำลอง | ผลลัพธ์ที่คาดหวัง | ผลลัพธ์จริง | ผ่าน/ไม่ผ่าน |
| --- | --- | --- | --- | --- |
| Network error (โดเมนไม่มีอยู่จริง) | ตั้ง EXTERNAL_API_BASE_URL เป็น http://this-domain-does-not-exist-12345.invalid | retry 2 ครั้ง (backoff ~0.5-1s, ~1-2s) แล้ว fallback | retry 2 ครั้ง (delay: 960ms, 1837ms); error: getaddrinfo ENOTFOUND this-domain-does-not-exist-12345.invalid; ผลลัพธ์ source=fallback; ใช้เวลารวม 2.8s | ผ่าน |
| Timeout | mock server หน่วงตอบ 5 วินาที แต่ตั้ง timeoutMs = 500 | ครบ 500ms จึงถือว่าล้มเหลว (ECONNABORTED) → retry 2 ครั้ง → fallback | retry 2 ครั้ง (delay: 853ms, 1058ms), mock ได้รับ 3 request; error: timeout of 500ms exceeded; ผลลัพธ์ source=fallback; ใช้เวลารวม 3.5s | ผ่าน |
| External API คืน 500 | mock server ตอบ 500 ทุกครั้ง | retry เพราะเป็น 5xx รวม 3 request แล้ว fallback | retry 2 ครั้ง (delay: 925ms, 1845ms), mock ได้รับ 3 request; error: Request failed with status code 500; ผลลัพธ์ source=fallback; ใช้เวลารวม 2.8s | ผ่าน |
| External API คืน 404 (ไม่ควร retry) | mock server ตอบ 404 | 4xx ไม่ใช่ความล้มเหลวชั่วคราว → ไม่ retry (ยิงครั้งเดียว) แล้ว fallback | retry 0 ครั้ง (delay: -), mock ได้รับ 1 request; error: -; ผลลัพธ์ source=fallback; ใช้เวลารวม 0.0s | ผ่าน |
| ล้มเหลวชั่วคราวแล้วกลับมาปกติ | mock server ตอบ 500 ครั้งแรก แล้วตอบ 200 ครั้งที่ 2 | retry 1 ครั้งแล้วสำเร็จ ได้ source: external (ไม่ใช้ fallback) | retry 1 ครั้ง (delay: 733ms), mock ได้รับ 2 request; error: Request failed with status code 500; ผลลัพธ์ source=external; ใช้เวลารวม 0.7s | ผ่าน |

## รายละเอียดการตรวจสอบ

### Network error (โดเมนไม่มีอยู่จริง)
- ผ่าน: retry 2 ครั้ง (ต้องเท่ากับ 2)
- ผ่าน: source=fallback, available=false
- log retry ครั้งที่ 1/2: getaddrinfo ENOTFOUND this-domain-does-not-exist-12345.invalid → รอ 960ms
- log retry ครั้งที่ 2/2: getaddrinfo ENOTFOUND this-domain-does-not-exist-12345.invalid → รอ 1837ms

### Timeout
- ผ่าน: mock server ได้รับ request 3 ครั้ง (ต้องเท่ากับ 3)
- ผ่าน: ข้อความ error ทุกครั้งเป็น timeout
- ผ่าน: source=fallback
- log retry ครั้งที่ 1/2: timeout of 500ms exceeded → รอ 853ms
- log retry ครั้งที่ 2/2: timeout of 500ms exceeded → รอ 1058ms

### External API คืน 500
- ผ่าน: mock server ได้รับ request 3 ครั้ง (ต้องเท่ากับ 3)
- ผ่าน: ทุกครั้งที่ retry ได้ status 500
- ผ่าน: source=fallback
- log retry ครั้งที่ 1/2: Request failed with status code 500 → รอ 925ms
- log retry ครั้งที่ 2/2: Request failed with status code 500 → รอ 1845ms

### External API คืน 404 (ไม่ควร retry)
- ผ่าน: mock server ได้รับ request 1 ครั้ง (ต้องเท่ากับ 1)
- ผ่าน: retry 0 ครั้ง (ต้องเป็น 0)
- ผ่าน: source=fallback

### ล้มเหลวชั่วคราวแล้วกลับมาปกติ
- ผ่าน: mock server ได้รับ request 2 ครั้ง (ต้องเท่ากับ 2)
- ผ่าน: retry 1 ครั้ง (ต้องเป็น 1)
- ผ่าน: source=external, available=true
- log retry ครั้งที่ 1/2: Request failed with status code 500 → รอ 733ms

## ข้อสรุป
ผ่าน 5/5 สถานการณ์ — ทุกสถานการณ์ระบบตอบกลับด้วย response ที่มีความหมาย (external หรือ fallback) ไม่ค้างและไม่ crash

## ทดสอบผ่าน HTTP จริง (ทำด้วยมือ)
เปิดเซิร์ฟเวอร์ด้วยตัวแปรแวดล้อมแล้วเรียก `GET /api/v1/movies/1/external-info` ใน Postman:

```bash
EXTERNAL_API_BASE_URL=http://this-domain-does-not-exist-12345.invalid npm start   # network error
EXTERNAL_API_TIMEOUT_MS=1 npm start                                              # timeout
```

ผลที่ต้องได้คือ status 200, `externalInfo.source = "fallback"` และเห็น log `[external-api] ... (attempt 1/2)`, `(attempt 2/2)` ใน terminal

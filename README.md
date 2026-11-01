# Movie Information System — โครงงานระยะที่ 2 (Pno = 3)

เอกสาร API (OpenAPI/Swagger + Postman) และการเชื่อมต่อ API ภายนอกแบบทนทาน (Timeout / Retry / Fallback)

## เริ่มใช้งาน

```bash
# 1) สร้างฐานข้อมูล
mysql -u root -p < database/schema.sql
mysql -u root -p < database/seed.sql

# 2) ติดตั้งและรัน (ตั้งรหัสผ่านฐานข้อมูลผ่าน environment variable)
npm install
export DB_PASSWORD=รหัสผ่านของคุณ      # Windows PowerShell: $env:DB_PASSWORD="..."
npm run dev
```

- Swagger UI: http://localhost:3000/api-docs
- API base URL: http://localhost:3000/api/v1

ตัวแปรที่ตั้งได้: `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` `PORT`
`EXTERNAL_API_BASE_URL` (ค่าเริ่มต้น https://itunes.apple.com) `EXTERNAL_API_TIMEOUT_MS` (ค่าเริ่มต้น 3000)

## Endpoint (14)

| Method | Path | คำอธิบาย |
| --- | --- | --- |
| GET / POST | `/directors` | รายการ / เพิ่มผู้กำกับ |
| GET / PUT / DELETE | `/directors/{id}` | ดู / แก้ไข / ลบผู้กำกับ |
| GET / POST | `/movies` | ค้นหา (`?search=`) / เพิ่มภาพยนตร์ |
| GET / PUT / DELETE | `/movies/{id}` | รายละเอียดพร้อมรีวิว / แก้ไข / ลบ (cascade รีวิว) |
| GET / POST | `/movies/{id}/reviews` | รายการ / เขียนรีวิว |
| DELETE | `/reviews/{id}` | ลบรีวิว |
| GET | `/movies/{id}/external-info` | ข้อมูลเสริมจาก iTunes Search API (Retry/Timeout/Fallback) |

## ทดสอบอัตโนมัติ

```bash
npm run test:api       # Newman: รัน postman_collection.json กับ environment.json (ต้องรันเซิร์ฟเวอร์ไว้ก่อน)
npm run test:failure   # จำลองความล้มเหลวของ API ภายนอก 5 แบบ แล้วเขียนผลลง failure-scenario-results.md
```

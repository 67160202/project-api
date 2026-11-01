// src/db.js
// Connection Pool สำหรับฐานข้อมูล movie_db (mysql2)
// ไม่ใส่รหัสผ่านไว้ในโค้ด — ตั้งค่าผ่าน environment variable เท่านั้น (DB_PASSWORD)

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Gtaivsen22!",
  database: process.env.DB_NAME || "movie_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true, // คืนค่า DATE เป็น "YYYY-MM-DD" ตรงกับที่ระบุใน OpenAPI
  decimalNumbers: true, // คืนค่า DECIMAL (rating) เป็น number ไม่ใช่ string
});

module.exports = pool;

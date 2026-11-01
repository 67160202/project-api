// src/services/external-api.js
// เรียก API ภายนอกอย่างทนทาน: Timeout + Retry (Exponential Backoff + Equal Jitter)
// ส่วน Fallback อยู่ที่ชั้น service (movie-info-service.js) ที่เรียกใช้ฟังก์ชันนี้

const axios = require("axios");

const DEFAULTS = {
  timeoutMs: 3000, // เวลาสูงสุดที่ยอมรอต่อ 1 ครั้ง
  maxRetries: 2, // retry ซ้ำ 2 ครั้ง (รวมเรียกสูงสุด 3 ครั้ง)
  baseDelayMs: 1000, // backoff ฐาน: 1000ms, 2000ms, ...
};

// ควร retry: network error / timeout (ไม่มี response), 429, 5xx
// ไม่ควร retry: 4xx อื่น ๆ เพราะส่งซ้ำก็ได้ผลเดิม
function isRetryable(error) {
  if (!error.response) return true;
  const status = error.response.status;
  return status === 429 || (status >= 500 && status < 600);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Equal Jitter: ครึ่งหนึ่งคงที่ + อีกครึ่งสุ่ม เพื่อไม่ให้ client หลายตัว retry พร้อมกันเป๊ะ
function computeBackoff(attempt, baseDelayMs) {
  const exponential = 2 ** (attempt - 1) * baseDelayMs;
  return exponential / 2 + Math.random() * (exponential / 2);
}

/**
 * @param {string} url
 * @param {object} [options]
 * @param {object} [options.params]       query string
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxRetries]
 * @param {number} [options.baseDelayMs]
 * @param {function} [options.onRetry]    เรียกก่อนรอ retry แต่ละครั้ง (ใช้ในสคริปต์ทดสอบ)
 * @param {function} [options.log]        ฟังก์ชัน log (ค่าเริ่มต้น console.warn)
 */
async function fetchWithRetry(url, options = {}) {
  const { params, timeoutMs, maxRetries, baseDelayMs, onRetry, log } = {
    ...DEFAULTS,
    log: console.warn,
    ...options,
  };

  let attempt = 0;

  while (true) {
    try {
      const response = await axios.get(url, { params, timeout: timeoutMs });
      return response.data;
    } catch (error) {
      attempt += 1;
      const canRetry = attempt <= maxRetries && isRetryable(error);

      if (!canRetry) {
        throw error;
      }

      const backoffMs = computeBackoff(attempt, baseDelayMs);
      const info = {
        attempt,
        maxRetries,
        url,
        message: error.message,
        status: error.response ? error.response.status : null,
        delayMs: Math.round(backoffMs),
      };
      if (log) {
        log(
          `[external-api] request to ${url} failed (attempt ${attempt}/${maxRetries}): ${error.message}. Retrying in ${info.delayMs}ms`,
        );
      }
      if (onRetry) onRetry(info);
      await delay(backoffMs);
    }
  }
}

module.exports = { fetchWithRetry, isRetryable, computeBackoff, DEFAULTS };

// src/services/movie-info-service.js
// ดึงข้อมูลเสริมของภาพยนตร์จาก iTunes Search API (ไม่ต้องใช้ API key)
// ถ้าบริการภายนอกล้มเหลวแม้ retry ครบ จะคืนค่า fallback แทนการโยน error

const { fetchWithRetry } = require("./external-api");

const DEFAULT_BASE_URL = "https://itunes.apple.com";

const FALLBACK_MESSAGE =
  "ไม่สามารถดึงข้อมูลเสริมจากบริการภายนอกได้ในขณะนี้ กรุณาลองใหม่ภายหลัง";

function pickMatch(results, movie) {
  const sameYear = results.filter(
    (r) =>
      r.releaseDate &&
      new Date(r.releaseDate).getUTCFullYear() === movie.releaseYear,
  );
  if (sameYear.length === 0) return null;
  const wanted = movie.title.trim().toLowerCase();
  return (
    sameYear.find(
      (r) => String(r.trackName || "").trim().toLowerCase() === wanted,
    ) || sameYear[0]
  );
}

/**
 * @param {{title: string, releaseYear: number}} movie
 * @param {object} [options] override ค่าของ fetchWithRetry (timeoutMs, maxRetries, baseDelayMs, onRetry, log)
 */
async function getMovieExternalInfo(movie, options = {}) {
  // อ่านทุกครั้งที่เรียก เพื่อให้จำลองความล้มเหลวได้โดยตั้ง env โดยไม่ต้องแก้โค้ด
  const baseUrl = (process.env.EXTERNAL_API_BASE_URL || DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );

  try {
    let data = await fetchWithRetry(`${baseUrl}/search`, {
      params: { term: movie.title, media: "movie", entity: "movie", limit: 10 },
      timeoutMs: Number(process.env.EXTERNAL_API_TIMEOUT_MS) || 3000,
      ...options,
    });

    // iTunes ตอบ Content-Type เป็น text/javascript ในบางกรณี
    if (typeof data === "string") data = JSON.parse(data);

    const results = Array.isArray(data.results) ? data.results : [];
    const match = pickMatch(results, movie);

    if (!match) {
      return {
        source: "external",
        available: true,
        details: null,
        message: "บริการภายนอกไม่พบข้อมูลภาพยนตร์เรื่องนี้",
      };
    }

    return {
      source: "external",
      available: true,
      details: {
        title: match.trackName || null,
        genre: match.primaryGenreName || null,
        contentRating: match.contentAdvisoryRating || null,
        releaseDate: match.releaseDate ? match.releaseDate.slice(0, 10) : null,
        description: match.longDescription || match.shortDescription || null,
        artworkUrl: match.artworkUrl100 || null,
      },
      message: "ดึงข้อมูลเสริมจากบริการภายนอกสำเร็จ",
    };
  } catch (error) {
    console.error(
      `[movie-info-service] external API unavailable after retries: ${error.message}`,
    );
    return {
      source: "fallback",
      available: false,
      details: null,
      message: FALLBACK_MESSAGE,
    };
  }
}

module.exports = { getMovieExternalInfo, FALLBACK_MESSAGE };

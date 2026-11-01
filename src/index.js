// src/index.js
// Movie Information System — REST API (Express + MySQL)
// Phase 2: เอกสาร OpenAPI/Swagger ที่ /api-docs และการเชื่อมต่อ API ภายนอกแบบทนทาน

const express = require("express");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const swaggerUi = require("swagger-ui-express");
const pool = require("./db");
const { getMovieExternalInfo } = require("./services/movie-info-service");

const app = express();
app.use(express.json());

// ---------- Swagger UI (อ่านจาก openapi.yaml ที่ root ของโปรเจกต์) ----------
const openapiDocument = yaml.load(
  fs.readFileSync(path.join(__dirname, "..", "openapi.yaml"), "utf8"),
);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiDocument));

// ---------- Helpers ----------
class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function parseId(raw) {
  if (!/^[1-9]\d{0,9}$/.test(String(raw)) || Number(raw) > 2147483647) {
    throw new ApiError(400, "INVALID_ID", "id ต้องเป็นจำนวนเต็มบวก");
  }
  return Number(raw);
}

function parsePagination(query) {
  const page = query.page === undefined ? 1 : query.page;
  const limit = query.limit === undefined ? 10 : query.limit;
  if (!/^[1-9]\d*$/.test(String(page))) {
    throw new ApiError(400, "VALIDATION_ERROR", "page ต้องเป็นจำนวนเต็มตั้งแต่ 1");
  }
  if (!/^[1-9]\d*$/.test(String(limit)) || Number(limit) > 100) {
    throw new ApiError(400, "VALIDATION_ERROR", "limit ต้องเป็นจำนวนเต็ม 1-100");
  }
  return { page: Number(page), limit: Number(limit) };
}

function paginationMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

function fail(errors) {
  throw new ApiError(400, "VALIDATION_ERROR", errors.join("; "));
}

function validateDirector(body) {
  const { name, nationality } = body || {};
  const errors = [];
  if (typeof name !== "string" || !name.trim() || name.trim().length > 150) {
    errors.push("name ต้องเป็นข้อความ 1-150 ตัวอักษร");
  }
  if (
    nationality !== undefined &&
    nationality !== null &&
    (typeof nationality !== "string" || nationality.length > 80)
  ) {
    errors.push("nationality ต้องเป็นข้อความไม่เกิน 80 ตัวอักษร");
  }
  if (errors.length) fail(errors);
  return {
    name: name.trim(),
    nationality: nationality ? nationality.trim() || null : null,
  };
}

function validateMovie(body) {
  const { title, directorId, releaseYear } = body || {};
  const errors = [];
  if (typeof title !== "string" || !title.trim() || title.trim().length > 200) {
    errors.push("title ต้องเป็นข้อความ 1-200 ตัวอักษร");
  }
  if (!Number.isInteger(directorId) || directorId < 1) {
    errors.push("directorId ต้องเป็นจำนวนเต็มบวก");
  }
  if (!Number.isInteger(releaseYear) || releaseYear < 1888 || releaseYear > 2100) {
    errors.push("releaseYear ต้องเป็นจำนวนเต็ม 1888-2100");
  }
  if (errors.length) fail(errors);
  return { title: title.trim(), directorId, releaseYear };
}

function validateReview(body) {
  const { reviewerName, rating, comment } = body || {};
  const errors = [];
  if (
    typeof reviewerName !== "string" ||
    !reviewerName.trim() ||
    reviewerName.trim().length > 100
  ) {
    errors.push("reviewerName ต้องเป็นข้อความ 1-100 ตัวอักษร");
  }
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating < 0 || rating > 10) {
    errors.push("rating ต้องเป็นตัวเลข 0-10");
  }
  if (
    comment !== undefined &&
    comment !== null &&
    (typeof comment !== "string" || comment.length > 5000)
  ) {
    errors.push("comment ต้องเป็นข้อความไม่เกิน 5000 ตัวอักษร");
  }
  if (errors.length) fail(errors);
  return {
    reviewerName: reviewerName.trim(),
    rating,
    comment: comment || null,
  };
}

// แปลง error ของ MySQL ที่คาดไว้ให้เป็น ApiError ที่มีความหมาย
async function translateDbError(promise, mapping) {
  try {
    return await promise;
  } catch (err) {
    if (err && mapping[err.code]) {
      const [status, code, message] = mapping[err.code];
      throw new ApiError(status, code, message);
    }
    throw err;
  }
}

// ---------- Query helpers ----------
const MOVIE_SELECT = `
  SELECT m.id, m.title, m.release_year AS releaseYear,
         m.director_id AS directorId, d.name AS director
  FROM movies m
  JOIN directors d ON m.director_id = d.id`;

async function findMovie(id) {
  const [rows] = await pool.query(`${MOVIE_SELECT} WHERE m.id = ?`, [id]);
  return rows[0] || null;
}

async function findDirector(id) {
  const [rows] = await pool.query(
    "SELECT id, name, nationality FROM directors WHERE id = ?",
    [id],
  );
  return rows[0] || null;
}

async function findReview(id) {
  const [rows] = await pool.query(
    `SELECT id, movie_id AS movieId, reviewer_name AS reviewerName,
            rating, comment, review_date AS reviewDate
     FROM reviews WHERE id = ?`,
    [id],
  );
  return rows[0] || null;
}

async function requireDirectorForBody(directorId) {
  if (!(await findDirector(directorId))) {
    throw new ApiError(400, "INVALID_DIRECTOR", `ไม่พบผู้กำกับ directorId=${directorId}`);
  }
}

// ---------- Routes: /api/v1 ----------
const router = express.Router();

// ===== Directors =====
router.get(
  "/directors",
  asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM directors");
    const [rows] = await pool.query(
      "SELECT id, name, nationality FROM directors ORDER BY id LIMIT ? OFFSET ?",
      [limit, (page - 1) * limit],
    );
    res.json({ data: rows, pagination: paginationMeta(page, limit, total) });
  }),
);

router.post(
  "/directors",
  asyncHandler(async (req, res) => {
    const { name, nationality } = validateDirector(req.body);
    const [result] = await translateDbError(
      pool.query("INSERT INTO directors (name, nationality) VALUES (?, ?)", [
        name,
        nationality,
      ]),
      { ER_DUP_ENTRY: [409, "DUPLICATE_DIRECTOR", "มีผู้กำกับชื่อนี้อยู่แล้ว"] },
    );
    res.status(201).json({ data: await findDirector(result.insertId) });
  }),
);

router.get(
  "/directors/:id",
  asyncHandler(async (req, res) => {
    const director = await findDirector(parseId(req.params.id));
    if (!director) throw new ApiError(404, "DIRECTOR_NOT_FOUND", "ไม่พบผู้กำกับ");
    res.json({ data: director });
  }),
);

router.put(
  "/directors/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { name, nationality } = validateDirector(req.body);
    if (!(await findDirector(id))) {
      throw new ApiError(404, "DIRECTOR_NOT_FOUND", "ไม่พบผู้กำกับ");
    }
    await translateDbError(
      pool.query("UPDATE directors SET name = ?, nationality = ? WHERE id = ?", [
        name,
        nationality,
        id,
      ]),
      { ER_DUP_ENTRY: [409, "DUPLICATE_DIRECTOR", "มีผู้กำกับชื่อนี้อยู่แล้ว"] },
    );
    res.json({ data: await findDirector(id) });
  }),
);

router.delete(
  "/directors/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!(await findDirector(id))) {
      throw new ApiError(404, "DIRECTOR_NOT_FOUND", "ไม่พบผู้กำกับ");
    }
    await translateDbError(pool.query("DELETE FROM directors WHERE id = ?", [id]), {
      ER_ROW_IS_REFERENCED_2: [
        409,
        "DIRECTOR_HAS_MOVIES",
        "ลบไม่ได้ เพราะผู้กำกับคนนี้ยังมีภาพยนตร์อยู่ในระบบ",
      ],
    });
    res.status(204).end();
  }),
);

// ===== Movies =====
router.get(
  "/movies",
  asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    let where = "";
    const params = [];
    if (search) {
      where = " WHERE m.title LIKE ?";
      params.push(`%${search}%`);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM movies m${where}`,
      params,
    );
    const [rows] = await pool.query(
      `${MOVIE_SELECT}${where} ORDER BY m.id LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    );
    res.json({ data: rows, pagination: paginationMeta(page, limit, total) });
  }),
);

router.post(
  "/movies",
  asyncHandler(async (req, res) => {
    const { title, directorId, releaseYear } = validateMovie(req.body);
    await requireDirectorForBody(directorId);
    const [result] = await translateDbError(
      pool.query(
        "INSERT INTO movies (title, director_id, release_year) VALUES (?, ?, ?)",
        [title, directorId, releaseYear],
      ),
      { ER_DUP_ENTRY: [409, "DUPLICATE_MOVIE", "มีภาพยนตร์ชื่อและปีนี้อยู่แล้ว"] },
    );
    res.status(201).json({ data: await findMovie(result.insertId) });
  }),
);

router.get(
  "/movies/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const movie = await findMovie(id);
    if (!movie) throw new ApiError(404, "MOVIE_NOT_FOUND", "ไม่พบภาพยนตร์");

    const [[director]] = await pool.query(
      "SELECT nationality FROM directors WHERE id = ?",
      [movie.directorId],
    );
    const [reviews] = await pool.query(
      `SELECT id, movie_id AS movieId, reviewer_name AS reviewerName,
              rating, comment, review_date AS reviewDate
       FROM reviews WHERE movie_id = ?
       ORDER BY review_date DESC, id DESC`,
      [id],
    );
    const ratings = reviews.map((r) => Number(r.rating));
    const averageRating = ratings.length
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
      : null;

    res.json({
      data: {
        ...movie,
        directorNationality: director ? director.nationality : null,
        averageRating,
        reviews: reviews.map((r) => ({ ...r, rating: Number(r.rating) })),
      },
    });
  }),
);

router.put(
  "/movies/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { title, directorId, releaseYear } = validateMovie(req.body);
    if (!(await findMovie(id))) {
      throw new ApiError(404, "MOVIE_NOT_FOUND", "ไม่พบภาพยนตร์");
    }
    await requireDirectorForBody(directorId);
    await translateDbError(
      pool.query(
        "UPDATE movies SET title = ?, director_id = ?, release_year = ? WHERE id = ?",
        [title, directorId, releaseYear, id],
      ),
      { ER_DUP_ENTRY: [409, "DUPLICATE_MOVIE", "มีภาพยนตร์ชื่อและปีนี้อยู่แล้ว"] },
    );
    res.json({ data: await findMovie(id) });
  }),
);

router.delete(
  "/movies/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!(await findMovie(id))) {
      throw new ApiError(404, "MOVIE_NOT_FOUND", "ไม่พบภาพยนตร์");
    }
    // reviews ถูกลบตามอัตโนมัติ (ON DELETE CASCADE)
    await pool.query("DELETE FROM movies WHERE id = ?", [id]);
    res.status(204).end();
  }),
);

// ===== Reviews =====
router.get(
  "/movies/:id/reviews",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!(await findMovie(id))) {
      throw new ApiError(404, "MOVIE_NOT_FOUND", "ไม่พบภาพยนตร์");
    }
    const [rows] = await pool.query(
      `SELECT id, movie_id AS movieId, reviewer_name AS reviewerName,
              rating, comment, review_date AS reviewDate
       FROM reviews WHERE movie_id = ?
       ORDER BY review_date DESC, id DESC`,
      [id],
    );
    res.json({ data: rows.map((r) => ({ ...r, rating: Number(r.rating) })) });
  }),
);

router.post(
  "/movies/:id/reviews",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { reviewerName, rating, comment } = validateReview(req.body);
    if (!(await findMovie(id))) {
      throw new ApiError(404, "MOVIE_NOT_FOUND", "ไม่พบภาพยนตร์");
    }
    const [result] = await pool.query(
      "INSERT INTO reviews (movie_id, reviewer_name, rating, comment) VALUES (?, ?, ?, ?)",
      [id, reviewerName, rating, comment],
    );
    const review = await findReview(result.insertId);
    res.status(201).json({ data: { ...review, rating: Number(review.rating) } });
  }),
);

router.delete(
  "/reviews/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!(await findReview(id))) {
      throw new ApiError(404, "REVIEW_NOT_FOUND", "ไม่พบรีวิว");
    }
    await pool.query("DELETE FROM reviews WHERE id = ?", [id]);
    res.status(204).end();
  }),
);

// ===== External API integration (Retry / Timeout / Fallback) =====
router.get(
  "/movies/:id/external-info",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const movie = await findMovie(id);
    if (!movie) throw new ApiError(404, "MOVIE_NOT_FOUND", "ไม่พบภาพยนตร์");

    // คืน 200 เสมอ: ถ้าบริการภายนอกล้มเหลว service จะคืน source "fallback"
    const externalInfo = await getMovieExternalInfo(movie);
    res.json({
      data: { movieId: movie.id, title: movie.title, externalInfo },
    });
  }),
);

app.use("/api/v1", router);

// ---------- 404 / Error handler ----------
app.use((req, res) => {
  res.status(404).json({
    error: { code: "ROUTE_NOT_FOUND", message: `ไม่พบเส้นทาง ${req.method} ${req.path}` },
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res
      .status(400)
      .json({ error: { code: "INVALID_JSON", message: "รูปแบบ JSON ไม่ถูกต้อง" } });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  console.error(err);
  res
    .status(500)
    .json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
});

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Movie Information System API running on http://localhost:${PORT}`);
    console.log(`Swagger UI: http://localhost:${PORT}/api-docs`);
  });
}

module.exports = app;

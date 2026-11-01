-- schema.sql
-- ระบบข้อมูลภาพยนตร์ (Movie Information System) — Pno = 3
-- สร้างฐานข้อมูลและตารางทั้งหมดตาม ERD

DROP DATABASE IF EXISTS movie_db;
CREATE DATABASE movie_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE movie_db;

-- ตาราง directors (ผู้กำกับ)
CREATE TABLE directors (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    nationality     VARCHAR(80),
    CONSTRAINT uq_directors_name UNIQUE (name)
);

-- ตาราง movies (ภาพยนตร์)
-- resource ตัวอย่างฟิลด์: title, director, releaseYear
CREATE TABLE movies (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(200) NOT NULL,
    director_id     INT NOT NULL,
    release_year    SMALLINT NOT NULL,

    CONSTRAINT fk_movies_director
        FOREIGN KEY (director_id) REFERENCES directors(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT uq_movies_title_year UNIQUE (title, release_year),
    CONSTRAINT chk_movies_release_year CHECK (release_year >= 1888)
);

-- ตาราง reviews (รีวิวภาพยนตร์)
CREATE TABLE reviews (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    movie_id        INT NOT NULL,
    reviewer_name   VARCHAR(100) NOT NULL,
    rating          DECIMAL(3,1) NOT NULL,
    comment         TEXT,
    review_date     DATE NOT NULL DEFAULT (CURRENT_DATE),

    CONSTRAINT fk_reviews_movie
        FOREIGN KEY (movie_id) REFERENCES movies(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT chk_reviews_rating CHECK (rating >= 0 AND rating <= 10)
);

-- Index เพิ่มเติมเพื่อรองรับการค้นหา (Use Case 1)
CREATE INDEX idx_movies_title ON movies(title);
CREATE INDEX idx_movies_director ON movies(director_id);
CREATE INDEX idx_reviews_movie ON reviews(movie_id);

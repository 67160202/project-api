
USE movie_db;

-- directors (3 records)
INSERT INTO directors (name, nationality) VALUES
('Christopher Nolan', 'British-American'),
('Hayao Miyazaki', 'Japanese'),
('Bong Joon-ho', 'South Korean');

-- movies (5 records) — title, director (FK), releaseYear
INSERT INTO movies (title, director_id, release_year) VALUES
('Inception', 1, 2010),
('Interstellar', 1, 2014),
('Spirited Away', 2, 2001),
('Princess Mononoke', 2, 1997),
('Parasite', 3, 2019);

-- reviews (6 records)
INSERT INTO reviews (movie_id, reviewer_name, rating, comment, review_date) VALUES
(1, 'Somchai P.', 9.0, 'เนื้อเรื่องดูซับซ้อนแต่สนุกมาก', '2024-01-10'),
(1, 'Nida K.', 8.5, 'โคตรแจ๋ว', '2024-02-15'),
(3, 'Anan T.', 9.5, 'จบสวย', '2023-11-20'),
(3, 'Suda W.', 8.0, 'เรื่องราวอบอุ่นหัวใจ', '2023-12-01'),
(5, 'Pim R.', 9.0, 'สะท้อนสังคมได้อย่างเฉียบคม', '2024-03-05'),
(5, 'Kittipong S.', 8.5, 'บทดีมาก บรรยากาศน่ากลัวนิดๆ', '2024-03-10');

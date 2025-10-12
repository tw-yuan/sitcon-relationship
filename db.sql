-- 確保使用正確的字符集
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- 建立資料庫（如果需要的話）
-- CREATE DATABASE admin_sitcon_relationship CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE admin_sitcon_relationship;

-- 刪除現有資料表（如果存在）
DROP TABLE IF EXISTS relations;
DROP TABLE IF EXISTS persons;

-- 建立人物表（使用 utf8mb4 字符集）
CREATE TABLE persons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    gender ENUM('male', 'female', 'femboy', 'unknown') DEFAULT 'unknown' COMMENT '性別：male=男生, female=女生, femboy=男娘, unknown=未知',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 建立關係表（使用 utf8mb4 字符集）
CREATE TABLE relations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_person_id INT NOT NULL,
    to_person_id INT NOT NULL,
    source TEXT COMMENT '關係來源：記錄這個關係是如何建立的（例如：SITCON 2024、黑客松、朋友介紹等）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_person_id) REFERENCES persons(id) ON DELETE CASCADE,
    FOREIGN KEY (to_person_id) REFERENCES persons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入範例資料
INSERT INTO persons (name, description, gender) VALUES
('Alice', 'SITCON 的組織者', 'female'),
('Bob', 'SITCON 的講師', 'male'),
('Charlie', 'SITCON 的志工', 'femboy'),
('Diana', 'SITCON 的參與者', 'female');

INSERT INTO relations (from_person_id, to_person_id, source) VALUES
(1, 2, 'SITCON 2023 年會'), -- Alice 認識 Bob
(1, 3, '志工培訓'), -- Alice 認識 Charlie
(2, 4, '演講後交流'), -- Bob 認識 Diana
(3, 4, '同組志工'); -- Charlie 認識 Diana

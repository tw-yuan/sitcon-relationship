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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 建立關係表（使用 utf8mb4 字符集）
CREATE TABLE relations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_person_id INT NOT NULL,
    to_person_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_person_id) REFERENCES persons(id) ON DELETE CASCADE,
    FOREIGN KEY (to_person_id) REFERENCES persons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入範例資料
INSERT INTO persons (name, description) VALUES
('Alice', 'SITCON 的組織者'),
('Bob', 'SITCON 的講師'),
('Charlie', 'SITCON 的志工'),
('Diana', 'SITCON 的參與者');

INSERT INTO relations (from_person_id, to_person_id) VALUES
(1, 2), -- Alice 認識 Bob
(1, 3), -- Alice 認識 Charlie
(2, 4), -- Bob 認識 Diana
(3, 4); -- Charlie 認識 Diana

-- 確保使用正確的字符集
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- 建立資料庫（如果需要的話）
-- CREATE DATABASE admin_sitcon_relationship CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE admin_sitcon_relationship;

-- 刪除現有資料表（如果存在）
DROP TABLE IF EXISTS person_backgrounds;
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

-- 建立人物背景表（使用 utf8mb4 字符集）
CREATE TABLE person_backgrounds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    person_id INT NOT NULL UNIQUE,
    birth_year INT COMMENT '出生西元年',
    body TEXT COMMENT '人物背景描述',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE
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

-- 插入人物背景範例資料
INSERT INTO person_backgrounds (person_id, birth_year, body) VALUES
(1, 2000, 'Alice 是 SITCON 的資深組織者，從高中就開始參與社群活動，對開源軟體充滿熱情。她是一位軟體工程師，喜歡演講和寫作，外向且熱情，曾獲得多個開源專案貢獻獎。'),
(2, 1995, 'Bob 是一位經驗豐富的技術講師，專精於後端開發和系統架構。他沉穩有耐心，注重細節，擁有多張專業認證，平時喜歡登山。'),
(3, 2003, 'Charlie 是 SITCON 的熱心志工，喜歡幫助他人解決技術問題。他是一位學生，正在學習 React 和 Vue，對前端開發和設計充滿興趣，也很喜歡動漫。'),
(4, 2001, 'Diana 是 SITCON 的新成員，對 AI 和機器學習特別感興趣。她是研究生，目前在研究自然語言處理，好奇心強且認真，喜歡閱讀和學習新事物。');

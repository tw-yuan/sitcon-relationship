-- 建立人物背景表
CREATE TABLE IF NOT EXISTS person_backgrounds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    person_id INT NOT NULL UNIQUE,
    age INT COMMENT '年齡',
    body TEXT COMMENT '人物背景描述',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入範例資料
INSERT INTO person_backgrounds (person_id, age, body) VALUES
(1, 25, 'Alice 是 SITCON 的資深組織者，從高中就開始參與社群活動，對開源軟體充滿熱情。她是一位軟體工程師，喜歡演講和寫作，外向且熱情，曾獲得多個開源專案貢獻獎。'),
(2, 30, 'Bob 是一位經驗豐富的技術講師，專精於後端開發和系統架構。他沉穩有耐心，注重細節，擁有多張專業認證，平時喜歡登山。'),
(3, 22, 'Charlie 是 SITCON 的熱心志工，喜歡幫助他人解決技術問題。他是一位學生，正在學習 React 和 Vue，對前端開發和設計充滿興趣，也很喜歡動漫。'),
(4, 24, 'Diana 是 SITCON 的新成員，對 AI 和機器學習特別感興趣。她是研究生，目前在研究自然語言處理，好奇心強且認真，喜歡閱讀和學習新事物。')
ON DUPLICATE KEY UPDATE 
    age=VALUES(age),
    body=VALUES(body);


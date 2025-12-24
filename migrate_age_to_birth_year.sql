-- 將 age 欄位改為 birth_year
ALTER TABLE person_backgrounds 
CHANGE COLUMN age birth_year INT COMMENT '出生西元年';


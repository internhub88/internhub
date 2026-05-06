-- ============================================================
-- Practice Search - Создание таблиц
-- База данных: Practice_search
-- Supabase: https://nfrmrpfdfbscplqgwrtx.supabase.co
-- ============================================================

-- ============================================================
-- 1. Пользователи
-- ============================================================
CREATE TABLE IF NOT EXISTS "Users" (
    user_id     SERIAL PRIMARY KEY,
    user_login  VARCHAR(100) NOT NULL,
    user_password VARCHAR(255) NOT NULL,
    user_token  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    role        INTEGER NOT NULL,
    CONSTRAINT user_login UNIQUE (user_login)
);

-- ============================================================
-- 2. Профили студентов
-- ============================================================
CREATE TABLE IF NOT EXISTS student_profiles (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    type_education  VARCHAR(255),
    resume          TEXT,
    birth_date      DATE,
    phone           VARCHAR(20),
    city            VARCHAR(100),
    about           TEXT,
    photo_url       VARCHAR(1000),
    cv_url          VARCHAR(1000),
    cv_original_name VARCHAR(255),
    practice_start  DATE,
    practice_end    DATE,
    is_open_to_offers BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_student_user FOREIGN KEY (user_id)
        REFERENCES "Users"(user_id) ON DELETE CASCADE
);

-- ============================================================
-- 3. Компании
-- ============================================================
CREATE TABLE IF NOT EXISTS "Companies" (
    company_id      SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL UNIQUE,
    company_name    VARCHAR(255) NOT NULL,
    description     TEXT,
    website         VARCHAR(500),
    contact_email   VARCHAR(255),
    logo_url        VARCHAR(1000),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_company_user FOREIGN KEY (user_id)
        REFERENCES "Users"(user_id) ON DELETE CASCADE
);

-- ============================================================
-- 4. Позиции (вакансии компании)
-- ============================================================
CREATE TABLE IF NOT EXISTS positions (
    position_id     SERIAL PRIMARY KEY,
    company_id      INTEGER NOT NULL,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    requirements    TEXT,
    period_start    DATE,
    period_end      DATE,
    is_open_ended   BOOLEAN NOT NULL DEFAULT FALSE,
    spots_total     INTEGER NOT NULL DEFAULT 1,
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'closed', 'draft')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_position_company FOREIGN KEY (company_id)
        REFERENCES "Companies"(company_id) ON DELETE CASCADE
);

-- ============================================================
-- 5. Сферы деятельности (группы)
-- ============================================================
CREATE TABLE IF NOT EXISTS job_groups (
    group_id    SERIAL PRIMARY KEY,
    title       VARCHAR(255) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO job_groups (title) VALUES
    ('IT & Development'),
    ('Design'),
    ('Food & Hospitality'),
    ('Business & Management'),
    ('Healthcare'),
    ('Education'),
    ('Construction & Engineering'),
    ('Marketing & Communications');

-- ============================================================
-- 6. Каталог должностей (привязаны к сферам)
-- ============================================================
CREATE TABLE IF NOT EXISTS job_categories (
    category_id SERIAL PRIMARY KEY,
    group_id    INTEGER NOT NULL
                    REFERENCES job_groups(group_id) ON DELETE CASCADE,
    title       VARCHAR(255) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO job_categories (group_id, title) VALUES
    (1, 'Backend Developer'),
    (1, 'Frontend Developer'),
    (1, 'Full Stack Developer'),
    (1, 'DevOps Engineer'),
    (1, 'QA Tester'),
    (1, 'Mobile Developer'),
    (1, 'Data Analyst'),
    (2, 'UX/UI Designer'),
    (2, 'Graphic Designer'),
    (2, '3D Modeler'),
    (3, 'Cook'),
    (3, 'Pastry Chef'),
    (3, 'Barista'),
    (3, 'Restaurant Manager'),
    (4, 'Project Manager'),
    (4, 'Business Analyst'),
    (4, 'HR Specialist'),
    (5, 'Nurse'),
    (5, 'Physiotherapist'),
    (6, 'Teaching Assistant'),
    (7, 'Construction Worker'),
    (7, 'Electrician'),
    (8, 'Marketing Specialist'),
    (8, 'Content Creator');

-- ============================================================
-- 7. Связь: вакансия <-> должности (многие-ко-многим)
-- ============================================================
CREATE TABLE IF NOT EXISTS position_categories (
    position_id INTEGER NOT NULL
        REFERENCES positions(position_id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL
        REFERENCES job_categories(category_id) ON DELETE CASCADE,
    PRIMARY KEY (position_id, category_id)
);

-- ============================================================
-- 8. Связь: студент <-> желаемые должности (многие-ко-многим)
-- ============================================================
CREATE TABLE IF NOT EXISTS student_categories (
    student_id  INTEGER NOT NULL
        REFERENCES student_profiles(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL
        REFERENCES job_categories(category_id) ON DELETE CASCADE,
    PRIMARY KEY (student_id, category_id)
);

-- ============================================================
-- 9. Ссылки студента (GitHub, LinkedIn, портфолио и т.д.)
-- ============================================================
CREATE TABLE IF NOT EXISTS "Student_links" (
    link_id     SERIAL PRIMARY KEY,
    student_id  INTEGER NOT NULL,
    link_type   VARCHAR(50)
                    CHECK (link_type IN ('github', 'linkedin', 'portfolio', 'other')),
    label       VARCHAR(100),
    url         VARCHAR(1000) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_link_student FOREIGN KEY (student_id)
        REFERENCES student_profiles(id) ON DELETE CASCADE
);

-- ============================================================
-- 10. Заявки на вакансии
-- ============================================================
CREATE TABLE IF NOT EXISTS applications (
    application_id  SERIAL PRIMARY KEY,
    student_id      INTEGER NOT NULL,
    position_id     INTEGER NOT NULL,
    cover_letter    TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'viewed', 'accepted', 'rejected')),
    company_response TEXT,
    applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, position_id),
    CONSTRAINT fk_app_student FOREIGN KEY (student_id)
        REFERENCES student_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_app_position FOREIGN KEY (position_id)
        REFERENCES positions(position_id) ON DELETE CASCADE
);

-- ============================================================
-- 11. Индексы
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_positions_company       ON positions(company_id);
CREATE INDEX IF NOT EXISTS idx_positions_status        ON positions(status);
CREATE INDEX IF NOT EXISTS idx_job_categories_group    ON job_categories(group_id);
CREATE INDEX IF NOT EXISTS idx_position_categories_pos ON position_categories(position_id);
CREATE INDEX IF NOT EXISTS idx_position_categories_cat ON position_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_student_categories_stu  ON student_categories(student_id);
CREATE INDEX IF NOT EXISTS idx_student_categories_cat  ON student_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_student_links_student   ON "Student_links"(student_id);
CREATE INDEX IF NOT EXISTS idx_applications_student    ON applications(student_id);
CREATE INDEX IF NOT EXISTS idx_applications_position   ON applications(position_id);
CREATE INDEX IF NOT EXISTS idx_applications_status     ON applications(status);

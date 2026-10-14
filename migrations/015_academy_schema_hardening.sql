-- Migration 015: Men's Academy schema hardening (Feature 11)
-- academy_categories: canonical lesson taxonomy with sort order
-- content_sources: approved evidence bodies cited by academy lessons

-- ─── academy_categories ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_categories (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug           VARCHAR(64)  NOT NULL UNIQUE,
    label          VARCHAR(120) NOT NULL,
    description    TEXT,
    sort_order     INTEGER      NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_academy_categories_sort
    ON academy_categories (sort_order);

-- Seed canonical categories matching AcademyLesson.category values in code
INSERT INTO academy_categories (slug, label, sort_order) VALUES
    ('basics',          'The Basics',                1),
    ('daily-life',      'Daily Life',                2),
    ('relationship',    'Relationship & Communication', 3),
    ('workplace',       'Workplace',                 4),
    ('sleep-intimacy',  'Sleep & Intimacy',          5)
ON CONFLICT (slug) DO NOTHING;

-- ─── content_sources ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_sources (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id      VARCHAR(64)  NOT NULL UNIQUE,
    source_name      VARCHAR(255) NOT NULL,
    organisation     VARCHAR(64)  NOT NULL,
    url              VARCHAR(512),
    publication_year INTEGER,
    approved_for_ai  BOOLEAN      NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_sources_org
    ON content_sources (organisation);

CREATE INDEX IF NOT EXISTS idx_content_sources_approved
    ON content_sources (approved_for_ai);

-- Seed the evidence bodies referenced by ACADEMY_LESSONS catalog
INSERT INTO content_sources (evidence_id, source_name, organisation, url, publication_year, approved_for_ai) VALUES
    ('ev-nams-001', 'The Menopause Society (NAMS) 2023 Position Statement', 'NAMS',
     'https://menopause.org/clinical-care/position-statements', 2023, true),
    ('ev-acog-002', 'ACOG Practice Bulletin on Menopause Management', 'ACOG',
     'https://www.acog.org/clinical/clinical-guidance/practice-bulletin', 2022, true),
    ('ev-cbt-010', 'NHS CBT-based Psychological Support for Menopausal Symptoms', 'NHS',
     'https://www.nice.org.uk/guidance/ng23', 2023, true),
    ('ev-act-012', 'ACT-based Couples Communication Guidelines', 'ACT',
     'https://contextualscience.org', 2021, true),
    ('ev-mbsr-011', 'MBSR Partner Support Framework — Harvard Health', 'Harvard Health',
     'https://www.health.harvard.edu', 2022, true)
ON CONFLICT (evidence_id) DO NOTHING;

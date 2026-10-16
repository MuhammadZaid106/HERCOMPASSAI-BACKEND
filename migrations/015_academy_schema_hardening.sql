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

ALTER TABLE academy_categories ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE academy_categories ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE academy_categories ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_academy_categories_sort
    ON academy_categories (sort_order);

-- Seed canonical categories matching AcademyLesson.category values in code
INSERT INTO academy_categories (id, slug, label, sort_order, created_at, updated_at) VALUES
    (gen_random_uuid(), 'basics',          'The Basics',                1, now(), now()),
    (gen_random_uuid(), 'daily-life',      'Daily Life',                2, now(), now()),
    (gen_random_uuid(), 'relationship',    'Relationship & Communication', 3, now(), now()),
    (gen_random_uuid(), 'workplace',       'Workplace',                 4, now(), now()),
    (gen_random_uuid(), 'sleep-intimacy',  'Sleep & Intimacy',          5, now(), now())
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

ALTER TABLE content_sources ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE content_sources ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE content_sources ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'content_sources' AND column_name = 'approved_for_a_i'
    ) THEN
        ALTER TABLE content_sources RENAME COLUMN approved_for_a_i TO approved_for_ai;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_content_sources_org
    ON content_sources (organisation);

CREATE INDEX IF NOT EXISTS idx_content_sources_approved
    ON content_sources (approved_for_ai);

-- Seed the evidence bodies referenced by ACADEMY_LESSONS catalog
INSERT INTO content_sources (id, evidence_id, source_name, organisation, url, publication_year, approved_for_ai, created_at, updated_at) VALUES
    (gen_random_uuid(), 'ev-nams-001', 'The Menopause Society (NAMS) 2023 Position Statement', 'NAMS',
     'https://menopause.org/clinical-care/position-statements', 2023, true, now(), now()),
    (gen_random_uuid(), 'ev-acog-002', 'ACOG Practice Bulletin on Menopause Management', 'ACOG',
     'https://www.acog.org/clinical/clinical-guidance/practice-bulletin', 2022, true, now(), now()),
    (gen_random_uuid(), 'ev-cbt-010', 'NHS CBT-based Psychological Support for Menopausal Symptoms', 'NHS',
     'https://www.nice.org.uk/guidance/ng23', 2023, true, now(), now()),
    (gen_random_uuid(), 'ev-act-012', 'ACT-based Couples Communication Guidelines', 'ACT',
     'https://contextualscience.org', 2021, true, now(), now()),
    (gen_random_uuid(), 'ev-mbsr-011', 'MBSR Partner Support Framework — Harvard Health', 'Harvard Health',
     'https://www.health.harvard.edu', 2022, true, now(), now())
ON CONFLICT (evidence_id) DO NOTHING;

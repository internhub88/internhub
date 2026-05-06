-- Add responsible contact flag to company_team
ALTER TABLE company_team
    ADD COLUMN IF NOT EXISTS is_responsible BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure only one responsible per company (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_team_responsible
    ON company_team (company_id)
    WHERE is_responsible = TRUE;

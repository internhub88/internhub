-- ============================================================
-- Notifications table for InternHub
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES "Users"(user_id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}',
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  application_id INTEGER REFERENCES applications(application_id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications(user_id, is_read, created_at DESC);

-- RLS: allow all operations (consistent with project's anon-fallback pattern)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_anon_all" ON notifications
FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "notif_auth_own" ON notifications
FOR ALL TO authenticated
USING (
  user_id IN (
    SELECT user_id FROM "Users" WHERE user_login = auth.email()
  )
)
WITH CHECK (true);

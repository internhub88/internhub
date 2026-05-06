-- Migration: add spots_total to positions
-- Adds the number of available internship spots to each position.
-- Default 1 so all existing rows are valid immediately.
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS spots_total INTEGER NOT NULL DEFAULT 1;

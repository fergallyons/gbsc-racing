-- Migration 002 — Add configurable pre-race window to club settings
-- Drives the three-state course display (stale / pending / live).

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS pre_race_window_hours int DEFAULT 12;

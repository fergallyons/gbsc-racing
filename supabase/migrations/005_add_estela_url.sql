-- Migration 005: add estela_url to settings
-- Stores the per-race eStela live tracking URL, set by the RO before each
-- King of the Bay race and cleared afterwards.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS estella_url text DEFAULT '';

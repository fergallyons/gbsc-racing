-- Create start_finish_lines table
CREATE TABLE IF NOT EXISTS start_finish_lines (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  lat1        DOUBLE PRECISION NOT NULL,
  lng1        DOUBLE PRECISION NOT NULL,
  lat2        DOUBLE PRECISION NOT NULL,
  lng2        DOUBLE PRECISION NOT NULL,
  is_default  BOOLEAN DEFAULT false,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0
);

-- Seed with the three known GBSC lines
INSERT INTO start_finish_lines (id, name, lat1, lng1, lat2, lng2, is_default, sort_order) VALUES
  ('club', 'Club Start/Finish',
   53 + 14.5687/60.0,  -(8 + 58.6148/60.0),
   53 + 14.7106/60.0,  -(8 + 58.6084/60.0),
   true, 0),
  ('galway_docks', 'Galway Docks Start',
   53 + 16.0355/60.0,  -(9 + 2.6577/60.0),
   53 + 16.0090/60.0,  -(9 + 2.8005/60.0),
   false, 1),
  ('ballyvaughan', 'Ballyvaughan Finish',
   53.1165,  -9.1490,
   53.1155,  -9.1495,
   false, 2)
ON CONFLICT (id) DO NOTHING;

-- RLS — same pattern as marks table
ALTER TABLE start_finish_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read lines"   ON start_finish_lines;
DROP POLICY IF EXISTS "anon insert lines" ON start_finish_lines;
DROP POLICY IF EXISTS "anon update lines" ON start_finish_lines;
DROP POLICY IF EXISTS "anon delete lines" ON start_finish_lines;
CREATE POLICY "anon read lines"   ON start_finish_lines FOR SELECT USING (true);
CREATE POLICY "anon insert lines" ON start_finish_lines FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update lines" ON start_finish_lines FOR UPDATE USING (true);
CREATE POLICY "anon delete lines" ON start_finish_lines FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON start_finish_lines TO anon;

-- Add line ID columns to published_courses (idempotent)
ALTER TABLE published_courses
  ADD COLUMN IF NOT EXISTS start_line_id  TEXT DEFAULT 'club',
  ADD COLUMN IF NOT EXISTS finish_line_id TEXT DEFAULT 'club';

-- Migration 003: Push notification subscriptions
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  boat_id    int         REFERENCES boats(id) ON DELETE CASCADE,
  endpoint   text        NOT NULL UNIQUE,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Any device (anon) can subscribe and unsubscribe by endpoint
CREATE POLICY "push_sub_insert" ON push_subscriptions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "push_sub_delete" ON push_subscriptions
  FOR DELETE USING (true);

-- No SELECT policy for anon — only the service role (Edge Function) can read subscriptions

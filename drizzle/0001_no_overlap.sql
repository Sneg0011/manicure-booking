CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN occupied tstzrange
  GENERATED ALWAYS AS (tstzrange(starts_at, occupied_until)) STORED;--> statement-breakpoint
ALTER TABLE bookings ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (master_id WITH =, occupied WITH &&)
  WHERE (status = 'active');--> statement-breakpoint
INSERT INTO settings (id, slot_step_min, min_lead_min, horizon_days, change_cutoff_min, max_client_moves)
VALUES (1, 30, 60, 30, 120, 3);

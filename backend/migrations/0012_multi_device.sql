-- 0012_multi_device.sql — allow multiple active devices per user
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_user_id_key;
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

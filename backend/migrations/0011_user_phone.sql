-- 0011_user_phone.sql — WhatsApp phone for staff credentials
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;

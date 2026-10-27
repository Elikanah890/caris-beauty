-- 0001_reference.sql — business, units, categories, devices, users
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS business (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tin TEXT,
  vrn TEXT,
  efd_device_id TEXT,
  phone TEXT,
  address TEXT,
  receipt_footer TEXT NOT NULL DEFAULT 'Asante kwa kununua!',
  currency TEXT NOT NULL DEFAULT 'TZS',
  timezone TEXT NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  is_base BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('owner','employee')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  device_id UUID,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY,
  receipt_prefix TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'Device',
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  last_receipt_seq BIGINT NOT NULL DEFAULT 0,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT devices_last_seq_nonneg CHECK (last_receipt_seq >= 0)
);

ALTER TABLE users
  ADD CONSTRAINT users_device_fk FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL;

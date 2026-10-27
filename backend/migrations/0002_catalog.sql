-- 0002_catalog.sql — products, product_units (NO stock_quantity on products)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  base_unit_id UUID NOT NULL REFERENCES units(id),
  cost_per_base BIGINT NOT NULL DEFAULT 0 CHECK (cost_per_base >= 0),
  price_per_base BIGINT NOT NULL DEFAULT 0 CHECK (price_per_base >= 0),
  reorder_level_base BIGINT NOT NULL DEFAULT 0 CHECK (reorder_level_base >= 0),
  expiry_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id),
  factor BIGINT NOT NULL CHECK (factor > 0),
  price_override BIGINT CHECK (price_override IS NULL OR price_override >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, unit_id)
);

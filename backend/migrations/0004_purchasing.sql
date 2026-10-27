-- 0004_purchasing.sql — purchases, purchase_items
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  reference TEXT,
  total_cost BIGINT NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','voided')),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  unit_symbol TEXT NOT NULL,
  qty NUMERIC(18,3) NOT NULL,
  qty_base BIGINT NOT NULL,
  factor BIGINT NOT NULL,
  cost_per_base BIGINT NOT NULL,
  line_total BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

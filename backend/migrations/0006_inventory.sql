-- 0006_inventory.sql — stock_movements (single source of truth for stock)
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase','sale','adjustment','return','sale_void','opening')),
  qty_base BIGINT NOT NULL,
  unit_cost BIGINT,
  reference_type TEXT,
  reference_id UUID,
  reason TEXT CHECK (reason IS NULL OR reason IN ('damaged','expired','count_correction','other')),
  note TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stock_qty_nonzero CHECK (qty_base <> 0)
);

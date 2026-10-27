-- 0005_selling.sql — sales, sale_items, payments
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no TEXT NOT NULL UNIQUE,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
  discount BIGINT NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total BIGINT NOT NULL CHECK (total >= 0),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','voided')),
  notes TEXT,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  unit_symbol TEXT NOT NULL,
  qty NUMERIC(18,3) NOT NULL CHECK (qty > 0),
  qty_base BIGINT NOT NULL CHECK (qty_base > 0),
  factor BIGINT NOT NULL,
  price_per_unit BIGINT NOT NULL,
  price_per_base BIGINT NOT NULL,
  cost_per_base BIGINT NOT NULL,
  line_total BIGINT NOT NULL,
  profit BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  tender TEXT NOT NULL CHECK (tender IN ('cash','mpesa','tigopesa','airtel','bank','credit')),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  reference TEXT,
  is_reversed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

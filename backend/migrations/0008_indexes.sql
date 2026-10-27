-- 0008_indexes.sql
CREATE INDEX IF NOT EXISTS idx_products_active ON products (is_active, deleted_at);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products (lower(name));
CREATE INDEX IF NOT EXISTS idx_product_units_product ON product_units (product_id);

CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales (sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status);
CREATE INDEX IF NOT EXISTS idx_sales_user ON sales (user_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales (customer_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items (product_id);
CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments (sale_id);
CREATE INDEX IF NOT EXISTS idx_payments_tender ON payments (tender);

CREATE INDEX IF NOT EXISTS idx_stock_product_created ON stock_movements (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_created ON stock_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_reference ON stock_movements (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases (purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items (purchase_id);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (spent_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue (status, created_at);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- 0010_sync_deletions.sql — tombstones for rows deleted on the server.
-- A sync client that missed a delete can remove its local copy even when the
-- underlying row is no longer returned by a normal pull.

CREATE TABLE IF NOT EXISTS sync_deletions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity TEXT NOT NULL,
  entity_id UUID NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_deletions_deleted_at
  ON sync_deletions (deleted_at);

-- Make existing soft-deleted products visible to clients that still have a
-- stale local copy. Re-stamp them so they arrive on the next pull.
INSERT INTO sync_deletions (entity, entity_id, deleted_at)
SELECT 'products', id, now()
FROM products
WHERE deleted_at IS NOT NULL
ON CONFLICT (entity, entity_id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at;

CREATE OR REPLACE FUNCTION record_product_sync_deletion()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO sync_deletions (entity, entity_id, deleted_at)
    VALUES ('products', OLD.id, now())
    ON CONFLICT (entity, entity_id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at;
    RETURN OLD;
  END IF;

  IF (NEW.deleted_at IS NOT NULL) THEN
    INSERT INTO sync_deletions (entity, entity_id, deleted_at)
    VALUES ('products', NEW.id, now())
    ON CONFLICT (entity, entity_id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at;
  ELSE
    DELETE FROM sync_deletions WHERE entity = 'products' AND entity_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_sync_soft_delete ON products;
CREATE TRIGGER trg_products_sync_soft_delete
AFTER UPDATE OF deleted_at ON products
FOR EACH ROW EXECUTE FUNCTION record_product_sync_deletion();

DROP TRIGGER IF EXISTS trg_products_sync_hard_delete ON products;
CREATE TRIGGER trg_products_sync_hard_delete
AFTER DELETE ON products
FOR EACH ROW EXECUTE FUNCTION record_product_sync_deletion();

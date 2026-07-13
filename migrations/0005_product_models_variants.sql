PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS product_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT DEFAULT '',
  category TEXT DEFAULT '',
  model TEXT DEFAULT '',
  name TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  list_price REAL DEFAULT 0,
  sale_price REAL DEFAULT 0,
  cost_price REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

ALTER TABLE products ADD COLUMN group_id INTEGER;

INSERT INTO product_groups(id,brand,category,model,name,notes,list_price,sale_price,cost_price,created_at,updated_at,deleted_at)
SELECT id,brand,category,model,name,notes,list_price,COALESCE(sale_price,list_price),cost_price,created_at,updated_at,deleted_at
FROM products
WHERE group_id IS NULL;

UPDATE products SET group_id=id WHERE group_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_group_id ON products(group_id);
CREATE INDEX IF NOT EXISTS idx_product_groups_brand_model ON product_groups(brand,model);

PRAGMA foreign_keys = ON;

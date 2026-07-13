ALTER TABLE products ADD COLUMN sale_price REAL NOT NULL DEFAULT 0;
UPDATE products SET sale_price = list_price WHERE sale_price = 0;
ALTER TABLE sale_items ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'percent';
ALTER TABLE sale_items ADD COLUMN discount_value REAL NOT NULL DEFAULT 0;

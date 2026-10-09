CREATE DATABASE novatek;

\c novatek

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  price NUMERIC(10,2) NOT NULL,
  old_price NUMERIC(10,2),
  image_url TEXT,
  badge VARCHAR(50),
  badge_type VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(150),
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(30),
  address VARCHAR(250),
  city VARCHAR(100),
  postal_code VARCHAR(20),
  password_hash VARCHAR(255),
  role VARCHAR(50) DEFAULT 'customer',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_items (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  order_number VARCHAR(60) NOT NULL UNIQUE,
  subtotal NUMERIC(10, 2) NOT NULL,
  shipping NUMERIC(10, 2) NOT NULL,
  total NUMERIC(10, 2) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'placed',
  payment_method VARCHAR(30) NOT NULL DEFAULT 'cash_on_delivery',
  shipping_name VARCHAR(150) NOT NULL,
  shipping_phone VARCHAR(30) NOT NULL,
  shipping_address VARCHAR(250) NOT NULL,
  shipping_city VARCHAR(100) NOT NULL,
  shipping_postal_code VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(150) NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash CHAR(64) PRIMARY KEY,
  provider VARCHAR(20) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  code_verifier TEXT,
  nonce TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);

INSERT INTO categories (name, image_url) VALUES
  ('Smartphones', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80'),
  ('Laptops', 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=600&q=80'),
  ('Audio', 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=600&q=80'),
  ('Wearables', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80'),
  ('Accessories', 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80'),
  ('Smart Home', 'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?auto=format&fit=crop&w=600&q=80')
ON CONFLICT DO NOTHING;

INSERT INTO products (name, category_id, price, old_price, image_url, badge, badge_type) VALUES
  ('NovaPhone 15 Pro', 1, 999.00, NULL, 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=900&q=80', 'New', 'new'),
  ('NovaBuds Pro', 3, 199.00, NULL, 'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=900&q=80', 'Best Seller', 'orange'),
  ('NovaBook Air M2', 2, 1299.00, NULL, 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=80', 'Sale', 'green'),
  ('NovaWatch X', 4, 249.00, 299.00, 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=900&q=80', NULL, NULL)
ON CONFLICT DO NOTHING;

INSERT INTO products (name, category_id, price, old_price, image_url, badge, badge_type)
SELECT seed.name, category.id, seed.price, seed.old_price, seed.image_url, seed.badge, seed.badge_type
FROM (VALUES
  ('NovaPhone 15', 'Smartphones', 799.00, 899.00, 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=80', 'Save $100', 'green'),
  ('NovaPhone SE', 'Smartphones', 449.00, NULL, 'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?auto=format&fit=crop&w=900&q=80', 'New', 'new'),
  ('NovaPad 11', 'Accessories', 599.00, NULL, 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=900&q=80', 'New', 'new'),
  ('NovaBook Pro 14', 'Laptops', 1599.00, 1749.00, 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=900&q=80', 'Save $150', 'green'),
  ('NovaBuds Lite', 'Audio', 79.00, NULL, 'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=900&q=80', 'Best Seller', 'orange'),
  ('NovaSound Mini', 'Audio', 129.00, 159.00, 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=900&q=80', 'Save $30', 'green'),
  ('NovaWatch SE', 'Wearables', 179.00, NULL, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80', 'New', 'new'),
  ('NovaFit Band', 'Wearables', 69.00, NULL, 'https://images.unsplash.com/photo-1557935728-e6d1eaabe558?auto=format&fit=crop&w=900&q=80', NULL, NULL),
  ('NovaCharge 3-in-1', 'Accessories', 89.00, 109.00, 'https://images.unsplash.com/photo-1609592806596-b43bada2f6b9?auto=format&fit=crop&w=900&q=80', 'Save $20', 'green'),
  ('NovaPower 20K', 'Accessories', 59.00, NULL, 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&w=900&q=80', 'Best Seller', 'orange'),
  ('NovaHome Cam', 'Smart Home', 99.00, NULL, 'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=900&q=80', 'New', 'new'),
  ('NovaGlow Smart Bulb', 'Smart Home', 29.00, 39.00, 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80', 'Save $10', 'green')
) AS seed(name, category_name, price, old_price, image_url, badge, badge_type)
JOIN categories AS category ON category.name = seed.category_name
WHERE NOT EXISTS (
  SELECT 1 FROM products AS existing WHERE existing.name = seed.name
);

UPDATE products
SET image_url = '/product-images/' || id || '.svg';

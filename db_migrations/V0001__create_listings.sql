CREATE TABLE t_p75404960_ab_go_modern_app.listings (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  price VARCHAR(100),
  location VARCHAR(150),
  contact_phone VARCHAR(50),
  badge VARCHAR(20) DEFAULT NULL,
  views INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

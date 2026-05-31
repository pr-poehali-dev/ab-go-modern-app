CREATE TABLE t_p75404960_ab_go_modern_app.favorites (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER REFERENCES t_p75404960_ab_go_modern_app.listings(id),
  session_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(listing_id, session_id)
)

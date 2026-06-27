-- GDI Users Schema
-- Use for login_database = "D1" (Cloudflare D1) or login_database = "Hyperdrive" (PostgreSQL)
--
-- D1 deployment:
--   npx wrangler d1 execute gdi-users --file=./schema.sql
--
-- PostgreSQL (Hyperdrive) deployment:
--   psql $CONNECTION_STRING -f schema.sql

CREATE TABLE IF NOT EXISTS users (
  username    TEXT        PRIMARY KEY,
  password    TEXT        NOT NULL,
  created_at  INTEGER     NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- Example: insert a user
-- INSERT INTO users (username, password) VALUES ('admin', 'your-password-here');
-- INSERT INTO users (username, password) VALUES ('alice@gmail.com', '');  -- Google OAuth user (password ignored)

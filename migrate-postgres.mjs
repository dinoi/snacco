import pkg from 'pg';
const { Pool } = pkg;

const connectionString = 'postgresql://postgres:nQkfoRfOlZXBuMkaMcsqXKrULcZYufrp@zephyr.proxy.rlwy.net:16628/railway';

const pool = new Pool({ connectionString });

const sql = `
CREATE TYPE role AS ENUM ('user', 'admin');

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  github_id VARCHAR(64) NOT NULL UNIQUE,
  name TEXT,
  email VARCHAR(320),
  login_method VARCHAR(64) NOT NULL DEFAULT 'github',
  role role NOT NULL DEFAULT 'user',
  is_creator BOOLEAN NOT NULL DEFAULT FALSE,
  token_balance INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_signed_in TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE tutorials (
  id SERIAL PRIMARY KEY,
  creator_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  token_price INTEGER NOT NULL DEFAULT 1,
  demo_video_url TEXT NOT NULL,
  demo_video_key TEXT NOT NULL,
  tutorial_video_url TEXT NOT NULL,
  tutorial_video_key TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE chapters (
  id SERIAL PRIMARY KEY,
  tutorial_id INTEGER NOT NULL,
  label VARCHAR(255) NOT NULL,
  timestamp_seconds INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE unlocks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  tutorial_id INTEGER NOT NULL,
  tokens_paid INTEGER NOT NULL,
  unlocked_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE token_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running migration...');
    const statements = sql.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        await client.query(statement);
      }
    }
    
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

migrate();

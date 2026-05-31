import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
try {
  const res = await pool.query('SELECT id, title, "demoVideoKey", "tutorialVideoKey", "demoVideoUrl", "tutorialVideoUrl" FROM tutorials LIMIT 10');
  console.log(JSON.stringify(res.rows, null, 2));
} catch (err) {
  console.error('DB Error:', err.message);
} finally {
  await pool.end();
}

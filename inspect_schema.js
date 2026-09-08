const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  try {
    const res = await pool.query("SELECT table_name, column_name FROM information_schema.columns WHERE column_name IN ('planid', 'plan_id', 'userid', 'user_id', 'companyid', 'company_id')");
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
check();

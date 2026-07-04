const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runSqlFile(client, filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`Executing ${path.basename(filePath)}...`);
  await client.query(sql);
}

async function setupDatabase() {
  const client = await pool.connect();
  try {
    // Check if connected properly
    const res = await client.query('SELECT NOW() as time');
    console.log(`Connected to Neon Database at ${res.rows[0].time}`);

    // Prevent accidental data loss - do not drop schema by default
    // console.log('Dropping existing schema (if any)...');
    // await client.query(`
    //   DROP SCHEMA public CASCADE;
    //   CREATE SCHEMA public;
    //   GRANT ALL ON SCHEMA public TO public;
    // `);

    await runSqlFile(client, path.join(__dirname, 'schema.sql'));
    await runSqlFile(client, path.join(__dirname, 'features.sql'));
    await runSqlFile(client, path.join(__dirname, 'seed.sql'));

    console.log('Database setup complete. Campuses and admin user created.');
  } catch (error) {
    console.error('Error setting up database:', error);
  } finally {
    client.release();
    pool.end();
  }
}

setupDatabase();

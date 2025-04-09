// databaseConfig.js (using environment variables)
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config(); // Load environment variables from .env file

const pool = new Pool({
  user: process.env.DB_USER || 'webhook_app', // Default to your created user
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'webhook_dixa_db', // Default to your created database
  password: process.env.DB_PASSWORD || '1234', // Default password
  port: parseInt(process.env.DB_PORT || '5432'),
});

// Optional: Test the connection
pool.connect((err, client, done) => {
  if (err) {
    console.error('Error connecting to PostgreSQL:', err);
  } else {
    console.log('Successfully connected to PostgreSQL!');
    client.release();
  }
});

module.exports = pool;
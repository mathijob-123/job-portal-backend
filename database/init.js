const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const path = require('path');

async function initializeDatabase() {
    console.log('Connecting to MySQL Server...');
    
    try {
        // Connect to MySQL server without specifying a database first
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || ''
        });

        console.log('Successfully connected to MySQL Server.');

        // Read the schema.sql file
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Split the schema into individual statements
        // We split by semicolon, but we need to be careful with semicolons inside strings
        // For our simple schema, splitting by ';' is sufficient
        const statements = schema.split(';').map(stmt => stmt.trim()).filter(stmt => stmt.length > 0);

        console.log('Executing database schema creation...');
        
        for (let statement of statements) {
            await connection.query(statement);
        }

        console.log('✅ Database and all tables created successfully!');
        
        await connection.end();
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error initializing database:', error.message);
        console.error('Please make sure your MySQL server is running and the credentials in backend/.env are correct.');
        process.exit(1);
    }
}

initializeDatabase();

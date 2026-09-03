const { Pool } = require('pg');
require('dotenv').config();

// Create PostgreSQL connection pool using Supabase URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10, // Equivalent to connectionLimit: 10
});

// Test the connection
pool.connect()
    .then(client => {
        console.log('✅ Connected to PostgreSQL (Supabase) database via Wrapper.');
        client.release();
    })
    .catch(err => {
        console.error('❌ Error connecting to the PostgreSQL database.');
        console.error(err.message);
    });

/**
 * Converts a MySQL query (using ? placeholders) to a PostgreSQL query (using $1, $2)
 * and automatically appends RETURNING id for INSERT statements.
 */
function mysqlToPgQuery(sql) {
    let count = 1;
    let pgSql = sql.replace(/\?/g, () => `$${count++}`);
    
    // Auto-inject RETURNING id if it's an INSERT and doesn't already have one
    if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
        pgSql += ' RETURNING id';
    }
    
    return pgSql;
}

/**
 * Executes the query using PostgreSQL but formats the result to match mysql2/promise exactly
 */
async function executePgQuery(clientOrPool, query, params = []) {
    const pgQuery = mysqlToPgQuery(query);
    try {
        const result = await clientOrPool.query(pgQuery, params);
        
        // Emulate mysql2 response: [rows, fields]
        if (result.command === 'INSERT') {
            const insertResult = {
                insertId: result.rows.length > 0 ? result.rows[0].id : null,
                affectedRows: result.rowCount
            };
            return [insertResult, result.fields || []];
        }
        
        if (result.command === 'UPDATE' || result.command === 'DELETE') {
             const modifyResult = {
                 affectedRows: result.rowCount
             };
             return [modifyResult, result.fields || []];
        }

        return [result.rows || [], result.fields || []];
    } catch (error) {
        console.error('Database Error:', error.message);
        console.error('Original Query:', query);
        console.error('Parsed Query:', pgQuery);
        throw error;
    }
}

// Emulate the mysql2 pool object
const wrappedPool = {
    async execute(query, params = []) {
        return executePgQuery(pool, query, params);
    },
    
    async query(query, params = []) {
        return executePgQuery(pool, query, params);
    },

    async getConnection() {
        const client = await pool.connect();
        return {
            async execute(query, params = []) {
                return executePgQuery(client, query, params);
            },
            async query(query, params = []) {
                return executePgQuery(client, query, params);
            },
            async beginTransaction() {
                return client.query('BEGIN');
            },
            async commit() {
                return client.query('COMMIT');
            },
            async rollback() {
                return client.query('ROLLBACK');
            },
            release() {
                client.release();
            }
        };
    }
};

module.exports = wrappedPool;

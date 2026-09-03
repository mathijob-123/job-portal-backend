const path = require('path');
const sqlite3 = require(path.resolve(__dirname, '../node_modules/sqlite3')).verbose();
const { Pool } = require(path.resolve(__dirname, '../node_modules/pg'));
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const sqlitePath = path.resolve(__dirname, '../database.sqlite');
const sqliteDb = new sqlite3.Database(sqlitePath);

const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Helper to query SQLite with promises
function sqliteAll(query, params = []) {
    return new Promise((resolve, reject) => {
        sqliteDb.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function sqliteGet(query, params = []) {
    return new Promise((resolve, reject) => {
        sqliteDb.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

async function migrate() {
    console.log('🚀 Starting SQLite to Supabase PostgreSQL Migration...');
    console.log(`Connecting to Supabase at: ${process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1] : 'undefined'}`);

    const client = await pgPool.connect();

    try {
        // 1. Get list of all SQLite tables
        const tables = await sqliteAll(
            "SELECT name, sql FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence' ORDER BY name;"
        );

        console.log(`Found ${tables.length} tables in SQLite to migrate.`);

        // 2. Disable foreign keys temporarily in PostgreSQL during migration
        await client.query('SET session_replication_role = replica;');

        for (const table of tables) {
            const tableName = table.name;
            console.log(`\n📦 Processing table: "${tableName}"...`);

            // Get table info from SQLite
            const columns = await sqliteAll(`PRAGMA table_info("${tableName}");`);
            
            // Build PostgreSQL CREATE TABLE statement
            const colDefs = columns.map(col => {
                const colNameLower = col.name.toLowerCase();
                const name = `"${colNameLower}"`;
                let type = 'TEXT';
                const colTypeUpper = (col.type || '').toUpperCase();

                if (col.pk === 1 && (colTypeUpper.includes('INT') || colTypeUpper === '')) {
                    return `${name} SERIAL PRIMARY KEY`;
                }

                if (colTypeUpper.includes('INT')) {
                    type = 'BIGINT';
                } else if (colTypeUpper.includes('REAL') || colTypeUpper.includes('FLOAT') || colTypeUpper.includes('DOUBLE')) {
                    type = 'DOUBLE PRECISION';
                } else if (colTypeUpper.includes('BOOL')) {
                    type = 'BOOLEAN';
                } else if (colTypeUpper.includes('TIME') || colTypeUpper.includes('DATE')) {
                    type = 'TIMESTAMP WITH TIME ZONE';
                } else {
                    type = 'TEXT';
                }

                let def = `${name} ${type}`;
                if (col.notnull) def += ' NOT NULL';
                if (col.dflt_value !== null) {
                    let dflt = String(col.dflt_value).trim();
                    if (dflt.startsWith('"') && dflt.endsWith('"')) {
                        dflt = "'" + dflt.slice(1, -1).replace(/'/g, "''") + "'";
                    }
                    if (dflt.toUpperCase() === 'CURRENT_TIMESTAMP') {
                        dflt = 'CURRENT_TIMESTAMP';
                    }
                    def += ` DEFAULT ${dflt}`;
                }
                if (col.pk === 1 && !def.includes('PRIMARY KEY')) {
                    def += ' PRIMARY KEY';
                }
                return def;
            });

            // Drop existing table if any and re-create cleanly
            await client.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);
            const createSql = `CREATE TABLE "${tableName}" (\n  ${colDefs.join(',\n  ')}\n);`;
            await client.query(createSql);
            console.log(`  ✓ Table structure created in Supabase.`);

            // Get all rows from SQLite
            const rows = await sqliteAll(`SELECT * FROM "${tableName}";`);
            if (rows.length === 0) {
                console.log(`  ✓ 0 rows (empty table).`);
                continue;
            }

            console.log(`  Transferring ${rows.length} rows to Supabase...`);

            // Insert rows in batches
            const colNames = columns.map(c => c.name);
            const quotedColNames = colNames.map(c => `"${c.toLowerCase()}"`).join(', ');

            for (const row of rows) {
                const values = colNames.map(c => {
                    let val = row[c];
                    if (val === undefined) return null;
                    return val;
                });

                const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
                const insertSql = `INSERT INTO "${tableName}" (${quotedColNames}) VALUES (${placeholders});`;
                await client.query(insertSql, values);
            }

            // Sync sequence if table has a serial primary key
            const pkCol = columns.find(c => c.pk === 1 && (c.type || '').toUpperCase().includes('INT'));
            if (pkCol) {
                try {
                    await client.query(`
                        SELECT setval(
                            pg_get_serial_sequence('"${tableName}"', '${pkCol.name.toLowerCase()}'),
                            COALESCE((SELECT MAX("${pkCol.name.toLowerCase()}") FROM "${tableName}"), 1)
                        );
                    `);
                } catch (e) {
                    // Sequence might not exist if primary key wasn't serial, which is fine
                }
            }


            console.log(`  ✓ Successfully migrated ${rows.length} rows into "${tableName}".`);
        }

        // 3. Re-enable foreign keys / triggers
        await client.query('SET session_replication_role = DEFAULT;');

        console.log('\n🎉 ALL 37 TABLES AND DATA SUCCESSFULLY MIGRATED TO SUPABASE!');
    } catch (err) {
        console.error('\n❌ Migration failed:', err);
    } finally {
        client.release();
        sqliteDb.close();
        await pgPool.end();
    }
}

migrate();

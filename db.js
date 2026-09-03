const { Pool } = require('pg');
require('dotenv').config();

// Create PostgreSQL connection pool using Supabase URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: process.env.VERCEL ? 3 : 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000,
});

// Non-blocking test connection
pool.connect()
    .then(client => {
        console.log('✅ Connected to PostgreSQL (Supabase) database via Wrapper.');
        client.release();
    })
    .catch(err => {
        console.warn('⚠️ Initial Supabase pool connection notice:', err.message);
    });

/**
 * Converts a MySQL/SQLite query to PostgreSQL syntax:
 * 1. Converts ? placeholders to $1, $2, etc.
 * 2. Converts MySQL backticks (`col`) to PostgreSQL double quotes ("col")
 * 3. Converts double-quoted string literals in conditions (e.g. status = "active") to single quotes ('active')
 * 4. Converts MySQL ON DUPLICATE KEY UPDATE to PostgreSQL ON CONFLICT
 * 5. Auto-injects RETURNING * for INSERT statements to capture generated IDs.
 */
function mysqlToPgQuery(sql) {
    let count = 1;
    let pgSql = sql.replace(/\?/g, () => `$${count++}`);

    // Convert double-quoted string literals to single-quoted strings: "active" -> 'active', "" -> ''
    pgSql = pgSql.replace(/"([^"]*)"/g, (m, val) => `'${val.replace(/'/g, "''")}'`);

    // Replace backticks `name` with "name"
    pgSql = pgSql.replace(/`([^`]+)`/g, '"$1"');

    // Handle system_settings upsert (ON DUPLICATE KEY UPDATE)
    if (/system_settings/i.test(pgSql) && /ON DUPLICATE KEY UPDATE/i.test(pgSql)) {
        pgSql = pgSql.replace(
            /ON DUPLICATE KEY UPDATE[\s\S]*$/i,
            'ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"'
        );
    }

    // Normalize camelCase column names in SQL to match database schema
    pgSql = pgSql
        .replace(/\boriginalPrice\b/g, 'original_price')
        .replace(/\bplanType\b/g, 'plan_type')
        .replace(/\bplanName\b/g, 'plan_name')
        .replace(/\bofferPrice\b/g, 'offer_price')
        .replace(/\bdiscountPercentage\b/g, 'discount_percentage')
        .replace(/\bdurationDays\b/g, 'duration_days')
        .replace(/\bpostingLimit\b/g, 'posting_limit')
        .replace(/\bbadgeText\b/g, 'badge_text')
        .replace(/\bplanId\b/g, 'plan_id')
        .replace(/\bfeatureName\b/g, 'feature_name')
        .replace(/\bdisplayOrder\b/g, 'display_order')
        .replace(/\bfeatureValue\b/g, 'feature_value')
        .replace(/\bapplicationDeadline\b/g, 'application_deadline')
        .replace(/\bpostedAt\b/g, 'posted_at')
        .replace(/\bupdatedAt\b/g, 'updated_at');



    // Auto-inject RETURNING * if it's an INSERT and doesn't already have one
    const trimmed = pgSql.trim().toUpperCase();
    if (trimmed.startsWith('INSERT') && !trimmed.includes('RETURNING')) {
        pgSql += ' RETURNING *';
    }

    return pgSql;
}

/**
 * Normalizes rows so callers can access both camelCase and snake_case properties
 */
function normalizeRow(row) {
    if (!row || typeof row !== 'object') return row;
    const mapped = { ...row };
    
    // Users mappings
    if (mapped.hrname !== undefined) mapped.hrName = mapped.hrname;
    if (mapped.companyname !== undefined) mapped.companyName = mapped.companyname;
    if (mapped.ispremium !== undefined) mapped.isPremium = mapped.ispremium;
    if (mapped.applicationcount !== undefined) mapped.applicationCount = mapped.applicationcount;
    if (mapped.createdat !== undefined) mapped.createdAt = mapped.createdat;
    if (mapped.userid !== undefined) mapped.userId = mapped.userid;
    if (mapped.companyid !== undefined) mapped.companyId = mapped.companyid;
    if (mapped.applicantid !== undefined) mapped.applicantId = mapped.applicantid;
    if (mapped.jobid !== undefined) mapped.jobId = mapped.jobid;
    if (mapped.candidateid !== undefined) mapped.candidateId = mapped.candidateid;
    if (mapped.employerid !== undefined) mapped.employerId = mapped.employerid;
    if (mapped.appliedat !== undefined) mapped.appliedAt = mapped.appliedat;
    if (mapped.savedat !== undefined) mapped.savedAt = mapped.savedat;
    if (mapped.unlockedat !== undefined) mapped.unlockedAt = mapped.unlockedat;
    if (mapped.updatedat !== undefined) mapped.updatedAt = mapped.updatedat;
    if (mapped.postedat !== undefined) mapped.postedAt = mapped.postedat;

    // Plans mappings
    if (mapped.plan_type !== undefined) mapped.planType = mapped.plan_type;
    if (mapped.plantype !== undefined) mapped.planType = mapped.plantype;
    if (mapped.plan_name !== undefined) mapped.planName = mapped.plan_name;
    if (mapped.planname !== undefined) mapped.planName = mapped.planname;
    if (mapped.original_price !== undefined) mapped.originalPrice = mapped.original_price;
    if (mapped.originalprice !== undefined) mapped.originalPrice = mapped.originalprice;
    if (mapped.offer_price !== undefined) mapped.offerPrice = mapped.offer_price;
    if (mapped.offerprice !== undefined) mapped.offerPrice = mapped.offerprice;
    if (mapped.discount_percentage !== undefined) mapped.discountPercentage = mapped.discount_percentage;
    if (mapped.discountpercentage !== undefined) mapped.discountPercentage = mapped.discountpercentage;
    if (mapped.duration_days !== undefined) mapped.durationDays = mapped.duration_days;
    if (mapped.durationdays !== undefined) mapped.durationDays = mapped.durationdays;
    if (mapped.posting_limit !== undefined) mapped.postingLimit = mapped.posting_limit;
    if (mapped.postinglimit !== undefined) mapped.postingLimit = mapped.postinglimit;
    if (mapped.badge_text !== undefined) mapped.badgeText = mapped.badge_text;
    if (mapped.badgetext !== undefined) mapped.badgeText = mapped.badgetext;
    
    // Feature mappings
    if (mapped.plan_id !== undefined) mapped.planId = mapped.plan_id;
    if (mapped.planid !== undefined) mapped.planId = mapped.planid;
    if (mapped.feature_name !== undefined) mapped.featureName = mapped.feature_name;
    if (mapped.featurename !== undefined) mapped.featureName = mapped.featurename;
    if (mapped.display_order !== undefined) mapped.displayOrder = mapped.display_order;
    if (mapped.displayorder !== undefined) mapped.displayOrder = mapped.displayorder;
    if (mapped.feature_value !== undefined) mapped.featureValue = mapped.feature_value;
    if (mapped.featurevalue !== undefined) mapped.featureValue = mapped.featurevalue;

    // Jobs mappings
    if (mapped.application_deadline !== undefined) mapped.applicationDeadline = mapped.application_deadline;
    if (mapped.applicationdeadline !== undefined) mapped.applicationDeadline = mapped.applicationdeadline;

    return mapped;
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
            const firstRow = result.rows.length > 0 ? result.rows[0] : {};
            const generatedId = firstRow.id || firstRow.saved_job_id || firstRow[Object.keys(firstRow)[0]] || null;
            const insertResult = {
                insertId: generatedId ? Number(generatedId) || generatedId : null,
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

        const normalizedRows = (result.rows || []).map(normalizeRow);
        return [normalizedRows, result.fields || []];

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

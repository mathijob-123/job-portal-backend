const db = require('./db');

async function testQuota() {
    const userId = 'user_company_001';
    try {
        console.log('Testing employer quota query:');
        const [subRows] = await db.execute(`
            SELECT s.*, p.name AS plan_name, p.job_limit, p.data_request_limit, p.resume_downloads, p.contact_views 
            FROM subscriptions s 
            LEFT JOIN subscription_plans p ON s.planid = p.id
            WHERE (s.userid = ? OR s.companyid = ?) AND s.status = 'active' 
            ORDER BY s.id DESC LIMIT 1
        `, [String(userId), String(userId)]);
        console.log('SUCCESS subRows:', subRows);
    } catch (e) {
        console.error('FAILED:', e);
    }
}

testQuota();

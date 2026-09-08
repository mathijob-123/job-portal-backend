const db = require('./db');

async function testQuota() {
    const userId = 'user_company_001';
    try {
        console.log('1. Testing system_settings...');
        const [settingRows] = await db.execute('SELECT `value` FROM system_settings WHERE `key` = "free_employer_job_limit" LIMIT 1');
        console.log('system_settings OK:', settingRows);
    } catch (e) {
        console.error('system_settings FAILED:', e.message);
    }

    try {
        console.log('2. Testing jobs count...');
        const [jobCountRows] = await db.execute('SELECT COUNT(*) as count FROM jobs WHERE employerId = ? OR companyId = ?', [String(userId), String(userId)]);
        console.log('jobs count OK:', jobCountRows);
    } catch (e) {
        console.error('jobs count FAILED:', e.message);
    }

    try {
        console.log('3. Testing subscriptions...');
        const [subRows] = await db.execute(`
            SELECT s.*, p.name AS plan_name, p.jobLimit, p.dataRequestLimit, p.resumeDownloads, p.contactViews 
            FROM subscriptions s 
            LEFT JOIN subscription_plans p ON s.planId = p.id 
            WHERE (s.userId = ? OR s.companyId = ?) AND s.status = 'active' AND s.expiryDate > NOW() 
            ORDER BY s.id DESC LIMIT 1
        `, [userId, String(userId)]);
        console.log('subscriptions OK:', subRows);
    } catch (e) {
        console.error('subscriptions FAILED:', e.message);
    }
}

testQuota();

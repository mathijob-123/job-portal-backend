const db = require('./db');

async function testEmployerQuota() {
  const userId = 2; // test employer user ID or any ID
  try {
    const [settingRows] = await db.execute('SELECT `value` FROM system_settings WHERE `key` = "free_employer_job_limit" LIMIT 1');
    console.log('settingRows:', settingRows);

    const [jobCountRows] = await db.execute('SELECT COUNT(*) as count FROM jobs WHERE employer_id = ? OR company_id = ?', [String(userId), String(userId)]);
    console.log('jobCountRows:', jobCountRows);

    const [subRows] = await db.execute(`
        SELECT s.*, p.name AS plan_name, p.job_limit, p.data_request_limit, p.resume_downloads, p.contact_views 
        FROM subscriptions s 
        LEFT JOIN subscription_plans p ON s.planid = p.id 
        WHERE (s.userid = ? OR s.companyid = ?) AND s.status = 'active' 
        ORDER BY s.id DESC LIMIT 1
    `, [String(userId), String(userId)]);
    console.log('subRows:', subRows);
  } catch (err) {
    console.error('ERROR in testEmployerQuota:', err);
  }
}

testEmployerQuota();

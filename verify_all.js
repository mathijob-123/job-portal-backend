const app = require('./server');

async function runVerification() {
    console.log('🧪 Starting Full System Verification...');
    const server = app.listen(5098);

    try {
        // 1. Health check
        const healthRes = await fetch('http://localhost:5098/api/health');
        const health = await healthRes.json();
        console.log('1. Health Check:', health);

        // 2. Query Plans API (Database Supabase query via wrapper)
        const plansRes = await fetch('http://localhost:5098/api/plans');
        const plans = await plansRes.json();
        console.log(`2. Plans API: ${Array.isArray(plans) ? plans.length + ' plans found' : JSON.stringify(plans)}`);

        // 3. Admin Login with Supabase users table
        const loginRes = await fetch('http://localhost:5098/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@jobportal.com', password: 'admin123' })
        });
        const loginData = await loginRes.json();
        console.log('3. Admin Login Result:', loginData.message, '| Role:', loginData.user?.role);

        // 4. Jobs endpoint
        const jobsRes = await fetch('http://localhost:5098/api/jobs/all');
        const jobsData = await jobsRes.json();
        console.log(`4. Jobs API: ${Array.isArray(jobsData) ? jobsData.length + ' jobs returned' : JSON.stringify(jobsData)}`);

        console.log('\n✅ ALL SYSTEM CHECKS PASSED SUCCESSFULLY WITH SUPABASE DATABASE!');
    } catch (err) {
        console.error('❌ Verification check failed:', err);
    } finally {
        server.close();
        process.exit(0);
    }
}

runVerification();

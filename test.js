// Final verification test
async function test() {
    // 1. Admin login
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@jobportal.com', password: 'admin123' })
    });
    const loginData = await loginRes.json();
    console.log('1. Admin Login:', loginData.message, '| role:', loginData.user?.role);

    const token = loginData.token;

    // 2. Admin stats
    const statsRes = await fetch('http://localhost:5000/api/admin/stats', {
        headers: { 'Authorization': 'Bearer ' + token }
    });
    const statsData = await statsRes.json();
    console.log('2. Admin Stats:', JSON.stringify(statsData.stats));

    // 3. Admin user list
    const usersRes = await fetch('http://localhost:5000/api/admin/users', {
        headers: { 'Authorization': 'Bearer ' + token }
    });
    const usersData = await usersRes.json();
    console.log('3. Total users in DB:', usersData.users?.length);

    // 4. /me endpoint
    const meRes = await fetch('http://localhost:5000/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + token }
    });
    const meData = await meRes.json();
    console.log('4. /me endpoint:', JSON.stringify(meData.user));

    // 5. Jobseeker login
    const jobRes = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'candidate@test.com', password: 'password' })
    });
    const jobData = await jobRes.json();
    console.log('5. Candidate Login:', jobData.message, '| role:', jobData.user?.role);

    // 6. Jobseeker blocked from admin route
    const blockRes = await fetch('http://localhost:5000/api/admin/stats', {
        headers: { 'Authorization': 'Bearer ' + jobData.token }
    });
    const blockData = await blockRes.json();
    console.log('6. Jobseeker blocked from admin?', blockRes.status === 403, '|', blockData.message);

    // 7. Health check
    const healthRes = await fetch('http://localhost:5000/api/health');
    const healthData = await healthRes.json();
    console.log('7. Health check:', healthData.message);
}

test().catch(console.error);

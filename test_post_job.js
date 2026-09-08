const db = require('./db');

async function testPostJob() {
    try {
        const jobIdStr = `JOB-${Date.now()}`;
        const employerId = 'emp_2';
        const companyId = '2';
        const status = 'active';

        const query = `
            INSERT INTO jobs (
                job_id, employer_id, company_id, title, description, location, location_type, 
                number_of_openings, experience_type, minimum_experience, maximum_experience, education, 
                required_skills, preferred_skills, salary, minimum_salary, maximum_salary, salary_type, 
                salary_negotiable, company_name, company_logo, application_deadline, jobtype, 
                latitude, longitude, geo_address, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            jobIdStr, employerId, companyId, 'Test Software Engineer',
            'Job description test', 'Chennai, Tamil Nadu',
            'On-site', 2,
            'Any Experience', '1',
            '3', "Bachelor's Degree",
            'React, Node.js', 'PostgreSQL',
            '₹40,000 - ₹60,000 / monthly', '40000', '60000',
            'Monthly', 0,
            'Tech Corp', '',
            '2026-12-31', 'Full Time',
            '13.0827', '80.2707', 'Chennai, Tamil Nadu', status
        ];

        const [result] = await db.execute(query, values);
        console.log('✅ Job inserted successfully! Result:', result);

        // Try inserting a second job immediately (to test user condition: "one job post panna mudiyadhu adhukku apparam job post panna mudiyala")
        const jobIdStr2 = `JOB-${Date.now() + 1}`;
        const [result2] = await db.execute(query, [
            jobIdStr2, employerId, companyId, 'Test QA Engineer',
            'Second Job description test', 'Bangalore, Karnataka',
            'Remote', 1,
            'Fresher Only', '0',
            '1', "Bachelor's Degree",
            'Automation, Cypress', 'Jest',
            '₹30,000 - ₹50,000 / monthly', '30000', '50000',
            'Monthly', 0,
            'Tech Corp', '',
            '2026-12-31', 'Full Time',
            '12.9716', '77.5946', 'Bangalore, Karnataka', status
        ]);
        console.log('✅ Second Job inserted successfully! Result 2:', result2);

        // Now test getting open jobs
        const [openJobs] = await db.execute('SELECT * FROM jobs ORDER BY id DESC LIMIT 5');
        console.log('✅ Fetched latest jobs count:', openJobs.length);
        console.log('Sample job:', { id: openJobs[0].id, job_id: openJobs[0].job_id, title: openJobs[0].title, company_id: openJobs[0].company_id });
    } catch (err) {
        console.error('❌ Error inserting job:', err);
    }
}

testPostJob();

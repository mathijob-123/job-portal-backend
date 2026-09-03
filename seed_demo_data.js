const db = require('./db');
const bcrypt = require('bcryptjs');

async function seedData() {
    console.log('Seeding Demo Data for Admin Testing...');

    const hashedPassword = await bcrypt.hash('password', 10);
    const adminPassword = await bcrypt.hash('admin123', 10);

    // 1. Ensure Admin Accounts
    db.run(
        `INSERT OR REPLACE INTO users (id, email, password, role, companyName, hrName) 
         VALUES (1, 'admin@jobportal.com', ?, 'admin', 'Admin Portal', 'System Admin')`,
        [adminPassword]
    );

    db.run(
        `INSERT OR REPLACE INTO users (email, password, role, companyName, hrName) 
         VALUES ('admin@test.com', ?, 'admin', 'Admin Portal', 'Admin User')`,
        [hashedPassword]
    );

    // 2. Add Employers
    const employers = [
        { id: 4, email: 'company@test.com', companyName: 'Tech Solutions Pvt Ltd', hrName: 'Rachel Green', phone: '+91 98765 11111' },
        { id: 10, email: 'hr@acme.com', companyName: 'Acme Global Inc.', hrName: 'David Miller', phone: '+91 98765 22222' },
        { id: 11, email: 'recruiter@cloudscale.io', companyName: 'CloudScale Systems', hrName: 'Priya Sharma', phone: '+91 98765 33333' },
        { id: 20, email: 'hiring@abctech.com', companyName: 'ABC Technologies Pvt Ltd', hrName: 'Anil Kumar', phone: '+91 98765 44444' }
    ];

    for (const emp of employers) {
        db.run(
            `INSERT OR REPLACE INTO users (id, email, password, role, companyName, hrName, phone, isPremium) 
             VALUES (?, ?, ?, 'company', ?, ?, ?, 1)`,
            [emp.id, emp.email, hashedPassword, emp.companyName, emp.hrName, emp.phone]
        );

        // Ensure employer profile
        db.run(
            `INSERT OR REPLACE INTO employers (employer_id, email, mobile_number, mobile_verified, profile_completed, company_id)
             VALUES (?, ?, ?, 1, 1, ?)`,
            [`emp_${emp.id}`, emp.email, emp.phone, `comp_${emp.id}`]
        );

        // Ensure company profile
        db.run(
            `INSERT OR REPLACE INTO companies (company_id, employer_id, company_name, company_email, company_phone, industry, website, description)
             VALUES (?, ?, ?, ?, ?, 'IT & Software', 'https://example.com', 'Premier technology services')`,
            [`comp_${emp.id}`, `emp_${emp.id}`, emp.companyName, emp.email, emp.phone]
        );
    }

    // 3. Add Jobseekers / Candidates
    const candidates = [
        { id: 5, candidate_id: 'CAND-10001', email: 'candidate@test.com', name: 'John Doe', phone: '+91 9876543210', title: 'Data Analyst', skills: 'Python, SQL, Excel, Power BI', exp: '2 Years', city: 'Chennai', resume: 'https://example.com/john-resume.pdf' },
        { id: 12, candidate_id: 'CAND-10002', email: 'sarah@example.com', name: 'Sarah Jenkins', phone: '+91 9876543211', title: 'Senior React Developer', skills: 'React, Redux, JavaScript, TypeScript, CSS', exp: '4 Years', city: 'Bangalore', resume: 'https://example.com/sarah-resume.pdf' },
        { id: 13, candidate_id: 'CAND-10003', email: 'rahul@example.com', name: 'Rahul Verma', phone: '+91 9876543212', title: 'Full Stack Node.js Engineer', skills: 'Node.js, Express, MongoDB, AWS', exp: '3 Years', city: 'Chennai', resume: 'https://example.com/rahul-resume.pdf' },
        { id: 14, candidate_id: 'CAND-10004', email: 'priya.n@example.com', name: 'Priya Nandakumar', phone: '+91 9876543213', title: 'Data Analyst / BI Specialist', skills: 'Python, SQL, Tableau, Power BI, Statistics', exp: '3 Years', city: 'Chennai', resume: 'https://example.com/priya-resume.pdf' },
        { id: 15, candidate_id: 'CAND-10005', email: 'karthik.s@example.com', name: 'Karthik Subramanian', phone: '+91 9876543214', title: 'Data Engineer', skills: 'Python, SQL, Spark, Airflow, Snowflake', exp: '1 Year', city: 'Chennai', resume: 'https://example.com/karthik-resume.pdf' },
        { id: 16, candidate_id: 'CAND-10006', email: 'anita.r@example.com', name: 'Anita Roy', phone: '+91 9876543215', title: 'UI/UX Product Designer', skills: 'Figma, Adobe XD, Wireframing, UX Research', exp: '2 Years', city: 'Mumbai', resume: 'https://example.com/anita-resume.pdf' }
    ];

    for (const cand of candidates) {
        db.run(
            `INSERT OR REPLACE INTO users (id, email, password, role, hrName, phone, address, isPremium) 
             VALUES (?, ?, ?, 'jobseeker', ?, ?, ?, 1)`,
            [cand.id, cand.email, hashedPassword, cand.name, cand.phone, cand.city]
        );

        db.run(
            `INSERT OR REPLACE INTO candidates (
                candidate_id, email, mobile_number, mobile_verified, full_name,
                city, current_job_title, total_experience, resume_url, profile_completed, profile_completion_percentage
            ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, 1, 95)`,
            [cand.candidate_id, cand.email, cand.phone, cand.name, cand.city, cand.title, cand.exp, cand.resume]
        );

        // Seed skills
        cand.skills.split(',').forEach(sk => {
            db.run(`INSERT INTO candidate_skills (candidate_id, skill_name) VALUES (?, ?)`, [cand.candidate_id, sk.trim()]);
        });
    }

    // 4. Seed Premium Plans (Employer & Candidate separated, Company-Specific & Enterprise)
    const demoPlans = [
        // Employer Plans
        {
            name: 'Employer Free',
            target_role: 'employer',
            plan_type: 'common',
            price: 0,
            billing_type: 'monthly',
            duration_months: 12,
            job_limit: 3,
            contact_views: 10,
            resume_downloads: 5,
            candidate_search_limit: 20,
            data_request_limit: 0,
            data_export_limit: 0,
            badge_text: 'Free Plan',
            features: 'Post up to 3 Free Jobs\nView up to 10 Candidate Profiles\nDownload 5 Resumes\nStandard Support',
            status: 'active',
            priority_level: 1
        },
        {
            name: 'Employer Basic',
            target_role: 'employer',
            plan_type: 'common',
            price: 2999,
            billing_type: 'monthly',
            duration_months: 1,
            job_limit: 10,
            contact_views: 50,
            resume_downloads: 50,
            candidate_search_limit: 100,
            data_request_limit: 0,
            data_export_limit: 0,
            badge_text: 'Starter',
            features: 'Post up to 10 Jobs\nView 50 Candidate Profiles\nDownload 50 Resumes\nBasic Candidate Screening\n30 Days Active Listing',
            status: 'active',
            priority_level: 2
        },
        {
            name: 'Employer Standard',
            target_role: 'employer',
            plan_type: 'common',
            price: 5999,
            billing_type: 'monthly',
            duration_months: 1,
            job_limit: 25,
            contact_views: 200,
            resume_downloads: 200,
            candidate_search_limit: 500,
            data_request_limit: 1,
            data_export_limit: 200,
            badge_text: 'Popular Choice',
            is_popular: 1,
            features: 'Post up to 25 Jobs\nView 200 Candidate Profiles\nDownload 200 Resumes\n1 Custom Candidate Data Request (up to 200)\nPriority Job Listing\nDirect Interview Scheduler',
            status: 'active',
            priority_level: 3
        },
        {
            name: 'Employer Premium',
            target_role: 'employer',
            plan_type: 'common',
            price: 9999,
            billing_type: 'monthly',
            duration_months: 1,
            job_limit: 50,
            contact_views: 500,
            resume_downloads: 500,
            candidate_search_limit: 1000,
            data_request_limit: 5,
            data_export_limit: 500,
            badge_text: '🔥 50% OFF Best Value',
            features: 'Post up to 50 Jobs\nView 500 Candidate Profiles\nDownload 500 Resumes\n5 Candidate Data Requests (up to 500 candidates)\nFeatured Employer Branding\nRecruiter Analytics Dashboard\nDedicated Account Manager',
            status: 'active',
            priority_level: 4
        },
        {
            name: 'ABC Enterprise Hiring Plan',
            target_role: 'employer',
            plan_type: 'company_specific',
            company_id: 'comp_20',
            company_name: 'ABC Technologies Pvt Ltd',
            price: 50000,
            billing_type: 'custom',
            duration_months: 6,
            job_limit: 100,
            contact_views: 500,
            resume_downloads: 500,
            candidate_search_limit: 2000,
            data_request_limit: 500,
            data_export_limit: 500,
            badge_text: '👑 Custom Enterprise for ABC Tech',
            features: 'Post up to 100 Jobs\nView 500 Candidate Profiles\nDownload 500 Resumes\n500 Candidates Data Access\nBulk Candidate Export (Excel/CSV/PDF)\n6 Months Dedicated Hiring Support\nCustom ATS Integration',
            status: 'active',
            priority_level: 5
        },
        {
            name: 'Enterprise High-Volume Hiring Pack',
            target_role: 'employer',
            plan_type: 'enterprise',
            company_id: 'comp_4',
            company_name: 'Tech Solutions Pvt Ltd',
            price: 100000,
            billing_type: 'yearly',
            duration_months: 12,
            job_limit: 500,
            contact_views: 5000,
            resume_downloads: 1000,
            candidate_search_limit: 10000,
            data_request_limit: 1000,
            data_export_limit: 1000,
            badge_text: '🏆 Mega Enterprise',
            features: 'Post up to 500 Jobs\nView 5,000 Candidate Profiles\nDownload 1,000 Resumes\n1,000 Candidate Data Delivery (Excel/Email/WhatsApp)\nAdvanced Candidate Filtering\nDedicated Hiring Dashboard\nVIP 24/7 Priority Support',
            status: 'active',
            priority_level: 6
        },

        // Candidate Plans
        {
            name: 'Candidate Free',
            target_role: 'candidate',
            plan_type: 'common',
            price: 0,
            billing_type: 'one_time',
            duration_months: 12,
            application_limit: 10,
            resume_upload_limit: 1,
            resume_analysis_limit: 1,
            featured_profile: 0,
            skill_test_access: 1,
            mock_interview_access: 0,
            badge_text: 'Basic Free',
            features: 'Apply to up to 10 Jobs / Month\nStandard Profile Visibility\n1 Free AI Resume Analysis\nBasic Job Alerts',
            status: 'active',
            priority_level: 1
        },
        {
            name: 'Candidate Basic',
            target_role: 'candidate',
            plan_type: 'common',
            price: 499,
            billing_type: 'monthly',
            duration_months: 1,
            application_limit: 50,
            resume_upload_limit: 3,
            resume_analysis_limit: 5,
            featured_profile: 0,
            skill_test_access: 1,
            mock_interview_access: 0,
            badge_text: 'Growth',
            features: 'Apply to up to 50 Jobs / Month\nResume Analysis & Scoring\nProfile Boost in Search Results\nInstant WhatsApp & Email Job Alerts',
            status: 'active',
            priority_level: 2
        },
        {
            name: 'Candidate Premium',
            target_role: 'candidate',
            plan_type: 'common',
            price: 999,
            billing_type: 'monthly',
            duration_months: 1,
            application_limit: -1,
            resume_upload_limit: 5,
            resume_analysis_limit: 20,
            featured_profile: 1,
            skill_test_access: 1,
            mock_interview_access: 1,
            recruiter_contact_access: 1,
            premium_job_access: 1,
            badge_text: '⭐ Recommended',
            is_popular: 1,
            features: 'Unlimited Job Applications\nFeatured Candidate Badge\nUnlimited AI Resume Scoring & Optimization\nFull Skill Tests & Certified Badges\nMock Interview Practice with Feedback\nDirect Recruiter Contact Access\nEarly Access to Premium & Confidential Jobs',
            status: 'active',
            priority_level: 3
        },
        {
            name: 'Candidate Pro Career Accelerator',
            target_role: 'candidate',
            plan_type: 'common',
            price: 1999,
            billing_type: 'quarterly',
            duration_months: 3,
            application_limit: -1,
            resume_upload_limit: 10,
            resume_analysis_limit: 50,
            featured_profile: 1,
            skill_test_access: 1,
            mock_interview_access: 1,
            recruiter_contact_access: 1,
            premium_job_access: 1,
            badge_text: '🚀 Career Pro',
            features: 'All Candidate Premium Features for 3 Months\nTop Priority Search Listing to Top 100 Companies\n1-on-1 Career Consultation & Resume Review\nGuaranteed Recruiter Profile Highlights\nSalary Negotiation Insights & Benchmarking',
            status: 'active',
            priority_level: 4
        }
    ];

    for (const plan of demoPlans) {
        db.run(
            `INSERT OR REPLACE INTO subscription_plans (
                name, target_role, plan_type, company_id, company_name, price, billing_type,
                duration_months, status, badge_text, is_popular, priority_level,
                job_limit, contact_views, resume_downloads, candidate_search_limit, data_request_limit,
                data_export_limit, application_limit, resume_upload_limit, resume_analysis_limit,
                featured_profile, skill_test_access, mock_interview_access, features, role
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                plan.name, plan.target_role, plan.plan_type, plan.company_id || '', plan.company_name || '', plan.price, plan.billing_type,
                plan.duration_months, plan.status, plan.badge_text, plan.is_popular ? 1 : 0, plan.priority_level,
                plan.job_limit || 0, plan.contact_views || -1, plan.resume_downloads || -1, plan.candidate_search_limit || -1, plan.data_request_limit || 0,
                plan.data_export_limit || 0, plan.application_limit || -1, plan.resume_upload_limit || 1, plan.resume_analysis_limit || 0,
                plan.featured_profile ? 1 : 0, plan.skill_test_access ? 1 : 0, plan.mock_interview_access ? 1 : 0, plan.features,
                plan.target_role === 'employer' ? 'company' : 'jobseeker'
            ]
        );
    }

    // 5. Seed Subscriptions
    const subExpiry = new Date();
    subExpiry.setMonth(subExpiry.getMonth() + 6);

    db.run(
        `INSERT OR REPLACE INTO subscriptions (
            id, userId, companyId, companyName, employerName, userEmail, planId,
            target_role, plan_type, amount, payment_status, status, startDate, expiryDate,
            jobsUsed, contactsViewed, resumeDownloads, dataRequestsUsed, candidateDataExported,
            admin_override, internal_notes
        ) VALUES (
            1, 20, 'comp_20', 'ABC Technologies Pvt Ltd', 'Anil Kumar', 'hiring@abctech.com', 5,
            'employer', 'company_specific', 50000, 'paid', 'active', datetime('now'), ?,
            35, 210, 180, 1, 210,
            '{"job_limit":100,"data_request_limit":500,"candidate_views":500}',
            'VIP Negotiated Plan for ABC Technologies - Approved by Admin'
        )`,
        [subExpiry.toISOString()]
    );

    db.run(
        `INSERT OR REPLACE INTO subscriptions (
            id, userId, companyId, companyName, employerName, userEmail, planId,
            target_role, plan_type, amount, payment_status, status, startDate, expiryDate,
            jobsUsed, contactsViewed, resumeDownloads, dataRequestsUsed, candidateDataExported
        ) VALUES (
            2, 4, 'comp_4', 'Tech Solutions Pvt Ltd', 'Rachel Green', 'company@test.com', 4,
            'employer', 'common', 9999, 'paid', 'active', datetime('now'), ?,
            12, 85, 60, 0, 0
        )`,
        [subExpiry.toISOString()]
    );

    // 6. Seed Sample Candidate Data Request (Requirement 10 & 11)
    db.run(
        `INSERT OR REPLACE INTO candidate_data_requests (
            id, request_code, employer_id, company_id, company_name, employer_name,
            employer_email, employer_phone, plan_id, plan_name, requested_role,
            location, experience_min, experience_max, skills, education,
            requested_count, approved_count, available_count, status, admin_notes
        ) VALUES (
            1, 'REQ-5001', '20', 'comp_20', 'ABC Technologies Pvt Ltd', 'Anil Kumar',
            'hiring@abctech.com', '+91 98765 44444', 5, 'ABC Enterprise Hiring Plan',
            'Data Analyst', 'Chennai', '0', '3', 'Python, SQL, Excel, Power BI', 'Any',
            500, 0, 500, 'pending', 'Urgent hiring for new FinTech project. Looking for immediate joiners.'
        )`
    );

    db.run(
        `INSERT OR REPLACE INTO candidate_data_requests (
            id, request_code, employer_id, company_id, company_name, employer_name,
            employer_email, employer_phone, plan_id, plan_name, requested_role,
            location, experience_min, experience_max, skills, education,
            requested_count, approved_count, available_count, status, admin_notes
        ) VALUES (
            2, 'REQ-4002', '4', 'comp_4', 'Tech Solutions Pvt Ltd', 'Rachel Green',
            'company@test.com', '+91 98765 11111', 4, 'Employer Premium',
            'Senior React Developer', 'Bangalore', '3', '6', 'React, TypeScript, Redux, Node.js', 'B.Tech / B.E.',
            200, 200, 200, 'completed', 'Exported and delivered CSV to employer email on 17-08-2026.'
        )`
    );

    // 7. Seed Payments
    db.run(
        `INSERT OR REPLACE INTO payments (id, userId, planId, amount, status, razorpayOrderId, razorpayPaymentId, createdAt)
         VALUES (1, 20, 5, 50000, 'success', 'order_abctech_001', 'pay_abctech_001', datetime('now'))`
    );
    db.run(
        `INSERT OR REPLACE INTO payments (id, userId, planId, amount, status, razorpayOrderId, razorpayPaymentId, createdAt)
         VALUES (2, 4, 4, 9999, 'success', 'order_techsol_002', 'pay_techsol_002', datetime('now'))`
    );

    // 8. Seed Audit Logs
    db.run(
        `INSERT OR REPLACE INTO audit_logs (id, admin_id, admin_name, admin_email, action, target_type, target_id, target_name, description, created_at)
         VALUES (1, '1', 'System Admin', 'admin@jobportal.com', 'GRANT_PREMIUM', 'subscriptions', '1', 'ABC Technologies Pvt Ltd', 'Granted ABC Enterprise Hiring Plan (₹50,000) with 500 candidate data limit and 100 job posts.', datetime('now', '-2 days'))`
    );
    db.run(
        `INSERT OR REPLACE INTO audit_logs (id, admin_id, admin_name, admin_email, action, target_type, target_id, target_name, description, created_at)
         VALUES (2, '1', 'System Admin', 'admin@jobportal.com', 'CREATE_PLAN', 'subscription_plans', '5', 'ABC Enterprise Hiring Plan', 'Created company-specific enterprise plan for ABC Technologies.', datetime('now', '-3 days'))`
    );

    // 9. Seed Sample Geo-Tagged Active Jobs
    const demoJobs = [
        {
            job_id: 'JOB-GEO-101',
            employer_id: '4',
            company_id: 'comp_4',
            companyId: 4,
            title: 'Senior Full Stack React & Node Engineer',
            job_title: 'Senior Full Stack React & Node Engineer',
            company_name: 'Tech Solutions Pvt Ltd',
            company_logo: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=80',
            description: 'Design and build next-gen enterprise web platforms with React 19, TypeScript, and microservices.',
            location: 'Bangalore, Karnataka',
            job_location: 'Koramangala, Bangalore, Karnataka',
            city: 'Bangalore',
            state: 'Karnataka',
            country: 'India',
            pincode: '560034',
            latitude: '12.9352',
            longitude: '77.6245',
            geo_address: 'Koramangala 5th Block, Bangalore',
            geo_radius: 25,
            salary: '₹18,00,000 - ₹26,00,000 / Year',
            experience: '3 - 6 Years',
            job_type: 'Full Time',
            skills: 'React, Node.js, TypeScript, PostgreSQL, AWS',
            hiring_priority: 'Urgent',
            status: 'active'
        },
        {
            job_id: 'JOB-GEO-102',
            employer_id: '20',
            company_id: 'comp_20',
            companyId: 20,
            title: 'AI Machine Learning & Data Scientist',
            job_title: 'AI Machine Learning & Data Scientist',
            company_name: 'ABC Technologies Pvt Ltd',
            company_logo: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=100&auto=format&fit=crop&q=80',
            description: 'Lead AI algorithm modeling and NLP pipelines for automated talent matchmaking systems.',
            location: 'Chennai, Tamil Nadu',
            job_location: 'OMR IT Corridor, Chennai, Tamil Nadu',
            city: 'Chennai',
            state: 'Tamil Nadu',
            country: 'India',
            pincode: '600096',
            latitude: '12.9719',
            longitude: '80.2458',
            geo_address: 'OMR Road, Sholinganallur, Chennai',
            geo_radius: 30,
            salary: '₹14,00,000 - ₹22,00,000 / Year',
            experience: '2 - 5 Years',
            job_type: 'Full Time',
            skills: 'Python, PyTorch, Scikit-Learn, SQL, NLP',
            hiring_priority: 'Normal',
            status: 'active'
        },
        {
            job_id: 'JOB-GEO-103',
            employer_id: '10',
            company_id: 'comp_10',
            companyId: 10,
            title: 'Senior Product Designer (UI/UX & Design Systems)',
            job_title: 'Senior Product Designer (UI/UX & Design Systems)',
            company_name: 'Acme Global Inc.',
            company_logo: 'https://images.unsplash.com/photo-1572021335469-31706a17aaef?w=100&auto=format&fit=crop&q=80',
            description: 'Create world-class user interfaces, motion prototypes, and intuitive design components for millions of users.',
            location: 'Mumbai, Maharashtra',
            job_location: 'Bandra Kurla Complex (BKC), Mumbai',
            city: 'Mumbai',
            state: 'Maharashtra',
            country: 'India',
            pincode: '400051',
            latitude: '19.0657',
            longitude: '72.8687',
            geo_address: 'BKC Business Hub, Bandra East, Mumbai',
            geo_radius: 20,
            salary: '₹12,00,000 - ₹18,00,000 / Year',
            experience: '3 - 5 Years',
            job_type: 'Full Time',
            skills: 'Figma, Design Systems, UX Prototyping, Wireframing',
            hiring_priority: 'Urgent',
            status: 'active'
        },
        {
            job_id: 'JOB-GEO-104',
            employer_id: '11',
            company_id: 'comp_11',
            companyId: 11,
            title: 'Cloud DevOps & Site Reliability Engineer',
            job_title: 'Cloud DevOps & Site Reliability Engineer',
            company_name: 'CloudScale Systems',
            company_logo: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=100&auto=format&fit=crop&q=80',
            description: 'Architect multi-cloud Kubernetes clusters, CI/CD automated deployments, and high-availability infrastructure.',
            location: 'Hyderabad, Telangana',
            job_location: 'HITEC City, Madhapur, Hyderabad',
            city: 'Hyderabad',
            state: 'Telangana',
            country: 'India',
            pincode: '500081',
            latitude: '17.4474',
            longitude: '78.3762',
            geo_address: 'Cyber Towers, HITEC City, Hyderabad',
            geo_radius: 35,
            salary: '₹16,00,000 - ₹24,00,000 / Year',
            experience: '4 - 7 Years',
            job_type: 'Full Time',
            skills: 'Kubernetes, Docker, Terraform, AWS, Prometheus',
            hiring_priority: 'Normal',
            status: 'active'
        },
        {
            job_id: 'JOB-GEO-105',
            employer_id: '4',
            company_id: 'comp_4',
            companyId: 4,
            title: 'Frontend React Developer (Remote Friendly)',
            job_title: 'Frontend React Developer (Remote Friendly)',
            company_name: 'Tech Solutions Pvt Ltd',
            company_logo: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=80',
            description: 'Build lightning-fast responsive UI dashboards, integrate REST APIs and state management flows.',
            location: 'New Delhi, NCR',
            job_location: 'Connaught Place / Cyber Hub, Delhi NCR',
            city: 'Delhi',
            state: 'Delhi',
            country: 'India',
            pincode: '110001',
            latitude: '28.6315',
            longitude: '77.2167',
            geo_address: 'Connaught Place, Central Delhi',
            geo_radius: 50,
            salary: '₹8,00,000 - ₹14,00,000 / Year',
            experience: '1 - 3 Years',
            job_type: 'Full Time',
            skills: 'React.js, Redux, Tailwind CSS, JavaScript',
            hiring_priority: 'Normal',
            status: 'active'
        }
    ];

    for (const j of demoJobs) {
        db.run(
            `INSERT OR REPLACE INTO jobs (
                job_id, employer_id, company_id, companyId, title, job_title, company_name, company_logo,
                description, job_description, location, job_location, city, state, country, pincode,
                latitude, longitude, geo_address, geo_radius, salary, experience, jobType, skills, required_skills,
                hiring_priority, status, posted_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
            )`,
            [
                j.job_id, j.employer_id, j.company_id, j.companyId, j.title, j.job_title, j.company_name, j.company_logo,
                j.description, j.description, j.location, j.job_location, j.city, j.state, j.country, j.pincode,
                j.latitude, j.longitude, j.geo_address, j.geo_radius, j.salary, j.experience, j.job_type, j.skills, j.skills,
                j.hiring_priority, j.status
            ]
        );
    }

    console.log('Seed completed successfully with comprehensive plans, subscriptions, data requests, and geo-tagged jobs!');
}

setTimeout(seedData, 1000);

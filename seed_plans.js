const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const employerPlansSeed = [
    {
        plan_type: 'employer', plan_name: 'Basic', original_price: 2299, offer_price: 1899,
        discount_percentage: 17, duration: '30 Days', duration_days: 30, posting_limit: 1,
        popular: 0, recommended: 0, badge_text: 'Starter Pack',
        description: 'Ideal for individual hiring requirements and single urgent openings.',
        features: [
            { name: 'Unlimited Candidate Applications', included: 1, value: 'Unlimited' },
            { name: '30 Day Job Validity', included: 1, value: '30 Days' },
            { name: 'Email Job Notifications', included: 1, value: 'Instant' },
            { name: 'Job Featured on Top', included: 0, value: '' },
            { name: 'Screened Leads', included: 0, value: '' },
            { name: 'Database Access', included: 0, value: '' },
            { name: 'WhatsApp Boosting Alerts', included: 0, value: '' },
            { name: 'AI Profile Recommendation', included: 0, value: '' }
        ]
    },
    {
        plan_type: 'employer', plan_name: 'Silver', original_price: 2799, offer_price: 2299,
        discount_percentage: 18, duration: '30 Days', duration_days: 30, posting_limit: 2,
        popular: 1, recommended: 0, badge_text: 'MOST POPULAR',
        description: 'Best value for growing teams and startups hiring across key positions.',
        features: [
            { name: 'Unlimited Candidate Applications', included: 1, value: 'Unlimited' },
            { name: '30 Day Job Validity', included: 1, value: '30 Days' },
            { name: 'Job Featured on Top', included: 1, value: '7 Days' },
            { name: 'Screened Leads', included: 1, value: '15 Leads' },
            { name: 'Candidate Database Access', included: 1, value: '50 Views' },
            { name: 'WhatsApp Boosting Alerts', included: 1, value: '3 Alerts' },
            { name: 'AI Candidate Recommendations', included: 1, value: 'Enabled' },
            { name: 'Dedicated Account Manager', included: 0, value: '' }
        ]
    },
    {
        plan_type: 'employer', plan_name: 'Gold', original_price: 4999, offer_price: 3999,
        discount_percentage: 20, duration: '60 Days', duration_days: 60, posting_limit: 5,
        popular: 0, recommended: 1, badge_text: 'RECOMMENDED',
        description: 'Comprehensive hiring solution for multiple urgent requirements.',
        features: [
            { name: '5 Active Job Postings', included: 1, value: '5 Jobs' },
            { name: '60 Day Extended Validity', included: 1, value: '60 Days' },
            { name: 'Job Featured on Top', included: 1, value: '30 Days' },
            { name: 'Screened Candidate Leads', included: 1, value: '50 Leads' },
            { name: 'Candidate Database Access', included: 1, value: '250 Views' },
            { name: 'WhatsApp Boosting Alerts', included: 1, value: '10 Alerts' },
            { name: 'AI Candidate Recommendations', included: 1, value: 'Priority' },
            { name: 'Resume Downloads & Excel Export', included: 1, value: '250 Resumes' }
        ]
    }
];

const candidatePlansSeed = [
    {
        plan_type: 'candidate', plan_name: 'Basic Free', original_price: 0, offer_price: 0,
        discount_percentage: 0, duration: '30 Days', duration_days: 30, posting_limit: 10,
        popular: 0, recommended: 0, badge_text: 'Free Forever',
        description: 'Standard package for candidates beginning their job search.',
        features: [
            { name: '10 Monthly Job Applications', included: 1, value: '10 Apps' },
            { name: 'Basic Job Alerts', included: 1, value: 'Email' },
            { name: 'Standard Profile Search Visibility', included: 1, value: 'Active' },
            { name: 'Featured Candidate Spotlight', included: 0, value: '' },
            { name: 'AI Resume Score & Optimization', included: 0, value: '' },
            { name: 'Direct Recruiter Messaging', included: 0, value: '' },
            { name: 'Dedicated Career Mentor', included: 0, value: '' }
        ]
    },
    {
        plan_type: 'candidate', plan_name: 'Pro Career Accelerator', original_price: 499, offer_price: 299,
        discount_percentage: 40, duration: '30 Days', duration_days: 30, posting_limit: 50,
        popular: 1, recommended: 0, badge_text: 'MOST POPULAR',
        description: 'Fast-track your interview calls with highlighted profile and AI resume scoring.',
        features: [
            { name: '50 Job Applications / Month', included: 1, value: '50 Apps' },
            { name: 'Featured Profile Spotlight', included: 1, value: 'Top 5%' },
            { name: 'AI Resume Score & Review', included: 1, value: 'Unlimited' },
            { name: 'WhatsApp Instant Job Alerts', included: 1, value: 'Instant' },
            { name: 'Direct Recruiter Contact', included: 1, value: '20 Contacts' },
            { name: 'Skill Assessment Practice Tests', included: 1, value: 'All Tests' },
            { name: '1-on-1 Dedicated Mentor Guidance', included: 0, value: '' }
        ]
    },
    {
        plan_type: 'candidate', plan_name: 'VIP Placement Pack', original_price: 999, offer_price: 699,
        discount_percentage: 30, duration: '90 Days', duration_days: 90, posting_limit: -1,
        popular: 0, recommended: 1, badge_text: 'RECOMMENDED',
        description: 'Complete 1-on-1 mentorship, live interview prep, and unlimited job applications.',
        features: [
            { name: 'Unlimited Job Applications', included: 1, value: 'Unlimited' },
            { name: 'Top Tier Recruiter Spotlight', included: 1, value: 'Guaranteed' },
            { name: '1-on-1 Dedicated Mentor Guidance', included: 1, value: '30 Days' },
            { name: 'Live Mock Interview & Feedback', included: 1, value: '2 Sessions' },
            { name: 'Direct Recruiter Messaging & Intro', included: 1, value: 'Unlimited' },
            { name: 'AI Resume & LinkedIn Optimization', included: 1, value: 'Full Review' },
            { name: 'Priority 24/7 SLA Support', included: 1, value: 'Priority' }
        ]
    }
];

db.serialize(() => {
    db.run('DROP TABLE IF EXISTS plan_features');
    db.run(`
        CREATE TABLE plan_features (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            feature_name TEXT NOT NULL,
            included INTEGER DEFAULT 1,
            feature_value TEXT DEFAULT '',
            display_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
        )
    `);

    db.run('DELETE FROM plans');

    const all = [...employerPlansSeed, ...candidatePlansSeed];
    all.forEach(p => {
        db.run(`
            INSERT INTO plans (
                plan_type, plan_name, description, original_price, offer_price,
                discount_percentage, duration, duration_days, posting_limit,
                popular, recommended, status, badge_text
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            p.plan_type, p.plan_name, p.description, p.original_price, p.offer_price,
            p.discount_percentage, p.duration, p.duration_days, p.posting_limit,
            p.popular, p.recommended, 'active', p.badge_text
        ], function (err) {
            if (err) {
                console.error('Error inserting plan', p.plan_name, err);
                return;
            }
            const planId = this.lastID;
            p.features.forEach((f, idx) => {
                db.run(`
                    INSERT INTO plan_features (plan_id, feature_name, included, feature_value, display_order)
                    VALUES (?, ?, ?, ?, ?)
                `, [planId, f.name, f.included, f.value, idx]);
            });
            console.log(`Seeded plan "${p.plan_name}" (#${planId}) with ${p.features.length} features.`);
        });
    });

    db.run("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('dynamic_plans_seeded', '1')");
});

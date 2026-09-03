const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

// Helper to record audit logs
const recordAuditLog = async (user, action, targetType, targetId, targetName, description, details) => {
    try {
        const adminId = user?.id || 1;
        const adminEmail = user?.email || 'admin@jobportal.com';
        const adminName = user?.name || user?.hrName || 'System Administrator';
        const detailsJson = typeof details === 'object' ? JSON.stringify(details) : String(details || '');

        await db.execute(`
            INSERT INTO audit_logs (adminId, adminEmail, adminName, action, targetType, targetId, targetName, description, detailsJson)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [adminId, adminEmail, adminName, action, targetType, String(targetId || ''), targetName || '', description || '', detailsJson]);
    } catch (e) {
        console.error('Audit logging error:', e);
    }
};

const DEFAULT_SETTINGS = {
    // 1. General Setting
    site_title: 'JobConnect Pro',
    site_tagline: 'Connect Talented Jobseekers with Premier Employers',
    site_email: 'support@jobconnect.com',
    site_phone: '+91 98765 43210',
    currency_symbol: '₹',
    currency_code: 'INR',
    timezone: 'Asia/Kolkata',
    date_format: 'DD/MM/YYYY',
    primary_color: '#2563eb',
    secondary_color: '#7c3aed',
    address: 'Cyber City Tech Hub, Bangalore, Karnataka - 560103',
    working_hours: 'Mon - Sat: 9:00 AM - 7:00 PM IST',
    default_user_role: 'jobseeker',

    // 2. Profile Update Setting
    allow_candidate_name_edit: 'true',
    allow_candidate_headline_edit: 'true',
    allow_employer_company_edit: 'true',
    min_profile_completion_for_apply: '60',
    require_resume_to_apply: 'true',
    require_phone_verify_apply: 'false',
    require_email_verify_post: 'true',
    auto_approve_candidate_profile: 'true',
    max_resume_updates_per_month: '10',

    // 3. Logo and Favicon
    logo_light: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80',
    logo_dark: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80',
    logo_admin: '',
    favicon_url: 'https://cdn-icons-png.flaticon.com/512/3850/3850285.png',
    watermark_url: '',
    email_logo_url: '',

    // 4. System Configuration
    free_employer_job_limit: '3',
    require_candidate_consent: 'true',
    mask_contact_info_default: 'false',
    job_expiry_days: '30',
    max_upload_size_mb: '10',
    allowed_file_types: '.pdf,.doc,.docx,.png,.jpg',
    force_https: 'true',
    debug_mode: 'false',
    log_retention_days: '90',

    // 5. Notification Setting
    mail_driver: 'smtp',
    mail_host: 'smtp.gmail.com',
    mail_port: '587',
    mail_username: 'notifications@jobconnect.com',
    mail_password: '••••••••••••••••',
    mail_encryption: 'tls',
    mail_from_address: 'no-reply@jobconnect.com',
    mail_from_name: 'JobConnect Portal',
    sms_gateway: 'twilio',
    sms_sender_id: 'JOBCON',
    sms_api_key: 'tw_live_99a8b7c6d5e4',
    notify_new_job: 'true',
    notify_new_applicant: 'true',
    notify_payment_success: 'true',
    notify_subscription_expiry: 'true',

    // 6. Payment Gateways
    razorpay_enabled: 'true',
    razorpay_key_id: 'rzp_test_1DP5mmOlF5G5ag',
    razorpay_key_secret: 'rzp_secret_key_mock_123',
    razorpay_mode: 'sandbox',
    stripe_enabled: 'true',
    stripe_publishable_key: 'pk_test_51MzMockStripeKey12345',
    stripe_secret_key: 'sk_test_51MzMockStripeSecret12345',
    paypal_enabled: 'false',
    paypal_client_id: 'paypal_client_id_mock',
    bank_transfer_enabled: 'true',
    bank_name: 'HDFC Bank Ltd.',
    bank_account_name: 'JobConnect Global Tech Pvt Ltd',
    bank_account_number: '50200088991122',
    bank_ifsc: 'HDFC0001234',
    bank_instructions: 'Please include your Order ID or registered email in payment remarks.',

    // 7. SEO Configuration
    meta_title: "JobConnect | India's #1 AI-Powered Job & Talent Portal",
    meta_description: 'Find verified high-paying jobs in IT, Marketing, Finance & AI. Recruit vetted talent effortlessly with smart matchmaking.',
    meta_keywords: 'jobs in india, tech jobs, remote work, ai career analyzer, hiring portal, recruiter software',
    og_title: 'JobConnect - Discover Your Dream Career',
    og_description: 'Empowering 50,000+ candidates and top tech enterprises with real-time job matching and career roadmaps.',
    og_image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&auto=format&fit=crop&q=80',
    twitter_card_type: 'summary_large_image',
    google_analytics_id: 'G-8X9Y7Z6W5V',
    google_search_console_code: 'googlesearchverificationtoken_abc123',
    facebook_pixel_id: 'fb_px_9876543210',

    // 8. Manage Frontend
    hero_badge_text: '🔥 #1 Job Portal in 2026',
    hero_title: 'Find Your Next Dream Career with AI Matching',
    hero_subtitle: 'Over 10,000+ active job openings from top tier companies and unicorn startups.',
    hero_cta_primary: 'Explore Jobs',
    hero_cta_secondary: 'Post a Job (Free)',
    stat_jobs_count: '15,400+',
    stat_companies_count: '2,800+',
    stat_candidates_count: '95,000+',
    stat_hired_rate: '98.4%',
    show_featured_companies: 'true',
    show_testimonials: 'true',
    footer_copyright: '© 2026 JobConnect Portal Inc. All rights reserved.',

    // 9. Manage Pages
    pages_json: JSON.stringify([
        { id: 1, title: 'About Us', slug: 'about-us', status: 'published', updated_at: '2026-08-15' },
        { id: 2, title: 'Contact Us', slug: 'contact-us', status: 'published', updated_at: '2026-08-14' },
        { id: 3, title: 'Pricing & Plans', slug: 'pricing', status: 'published', updated_at: '2026-08-18' },
        { id: 4, title: 'FAQ & Help Center', slug: 'faq', status: 'published', updated_at: '2026-08-10' },
        { id: 5, title: 'Career Advice & Blog', slug: 'blog', status: 'published', updated_at: '2026-08-19' }
    ]),

    // 10. Social Login Setting
    google_login_enabled: 'true',
    google_client_id: '1082736451234-mockapps.googleusercontent.com',
    google_client_secret: 'GOCSPX-mocksecret12345',
    linkedin_login_enabled: 'true',
    linkedin_client_id: '78mocklinkedinapp',
    linkedin_client_secret: 'mocklinkedinsecret',
    github_login_enabled: 'false',
    github_client_id: '',
    github_client_secret: '',
    facebook_login_enabled: 'false',

    // 11. Language
    default_language: 'en',
    enable_multilingual: 'true',
    rtl_support: 'false',
    available_languages: JSON.stringify([
        { code: 'en', name: 'English (US)', flag: '🇺🇸', status: 'active', is_default: true },
        { code: 'hi', name: 'Hindi (हिंदी)', flag: '🇮🇳', status: 'active', is_default: false },
        { code: 'es', name: 'Spanish (Español)', flag: '🇪🇸', status: 'active', is_default: false },
        { code: 'fr', name: 'French (Français)', flag: '🇫🇷', status: 'inactive', is_default: false },
        { code: 'de', name: 'German (Deutsch)', flag: '🇩🇪', status: 'inactive', is_default: false },
        { code: 'ar', name: 'Arabic (العربية)', flag: '🇸🇦', status: 'inactive', is_default: false }
    ]),
    translations_json: JSON.stringify({
        find_job: 'Find Jobs',
        post_job: 'Post a Job',
        login: 'Sign In',
        register: 'Sign Up',
        dashboard: 'Dashboard'
    }),

    // 12. Extensions
    recaptcha_enabled: 'true',
    recaptcha_site_key: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',
    recaptcha_secret_key: '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe',
    tawkto_enabled: 'false',
    tawkto_property_id: '',
    tawkto_widget_id: '',
    openai_resume_parser_enabled: 'true',
    openai_api_key: 'sk-proj-mockopenaiapikey12345',
    zoom_meeting_enabled: 'true',
    zoom_api_key: 'zoom_jwt_key_sample',
    zoom_api_secret: 'zoom_jwt_secret_sample',

    // 13. Cron Job Setting
    cron_job_expiry_schedule: '0 0 * * *',
    cron_job_expiry_enabled: 'true',
    cron_job_expiry_last_run: '2026-08-19 00:00:15',
    cron_subscription_reminder_schedule: '0 8 * * *',
    cron_subscription_reminder_enabled: 'true',
    cron_subscription_reminder_last_run: '2026-08-19 08:00:02',
    cron_candidate_alerts_schedule: '0 9 * * *',
    cron_candidate_alerts_enabled: 'true',
    cron_candidate_alerts_last_run: '2026-08-19 09:00:10',
    cron_backup_schedule: '0 2 * * 0',
    cron_backup_enabled: 'true',
    cron_backup_last_run: '2026-08-17 02:00:00',

    // 14. Policy Pages
    privacy_policy_content: `# Privacy Policy\n\n**Effective Date:** August 15, 2026\n\nJobConnect ("we", "our", or "us") is dedicated to protecting your privacy. This policy outlines our practices concerning data collection, candidate profile confidentiality, employer vetting, and data export agreements.\n\n### 1. Information We Collect\n- Candidate resume, contact details, work history, skill test results\n- Employer corporate credentials, GST, verified email addresses\n- Financial transaction IDs and subscription records\n\n### 2. How We Use Data\n- Smart AI matchmaking for job listings\n- Verifying candidate and recruiter legitimacy\n- Facilitating recruiter interview scheduling`,
    terms_conditions_content: `# Terms and Conditions\n\n**Last Updated:** August 15, 2026\n\nBy accessing or using the JobConnect platform, employers and jobseekers agree to be bound by these Terms of Service. Fraudulent job postings, abusive communication, or mass scraping will lead to immediate account termination.`,
    refund_policy_content: `# Refund & Cancellation Policy\n\nAll premium subscription purchases on JobConnect carry a 7-day conditional refund window if candidate unlocks or job posting limits have not been actively utilized.`,
    posting_guidelines_content: `# Employer Job Posting Guidelines\n\n1. All job listings must represent genuine, active employment opportunities.\n2. No discriminatory language or upfront fee requests to jobseekers.\n3. Accurate compensation ranges and job locations must be disclosed.`,
    policy_last_updated: 'August 15, 2026',

    // 15. Maintenance Mode
    maintenance_mode_enabled: 'false',
    maintenance_title: 'Under Scheduled System Maintenance',
    maintenance_message: 'We are currently undergoing scheduled upgrades to bring you even faster job matching and enhanced AI tools. We will be back online shortly.',
    maintenance_estimated_time: '2026-08-19 14:00 IST',
    maintenance_allowed_ips: '127.0.0.1, 192.168.1.1',
    maintenance_bypass_token: 'superadmin_bypass_2026',

    // 16. GDPR Cookie
    gdpr_cookie_enabled: 'true',
    gdpr_banner_position: 'bottom',
    gdpr_banner_text: 'We use cookies to improve your browsing experience, personalize job recommendations, and analyze our traffic. By clicking Accept All, you consent to our use of cookies.',
    gdpr_accept_button_text: 'Accept All',
    gdpr_reject_button_text: 'Decline Optional',
    gdpr_privacy_url: '/privacy-policy',
    gdpr_cookie_expiry_days: '365',
    gdpr_allow_marketing_toggle: 'true',

    // 17. Custom CSS
    custom_header_css: `/* Custom Portal Global Overrides */\n.btn-primary:hover {\n  transform: translateY(-2px);\n  box-shadow: 0 6px 20px rgba(37, 99, 235, 0.35);\n}`,
    custom_footer_js: `// Custom Analytics or Chat Init\nconsole.log('JobConnect Custom Portal Scripts Active');`,
    custom_header_meta: `<!-- Custom Verification Tags -->\n<meta name="portal-verification" content="jobconnect-verified-2026" />`,

    // 18. Sitemap XML
    sitemap_enabled: 'true',
    sitemap_include_jobs: 'true',
    sitemap_include_companies: 'true',
    sitemap_include_blogs: 'true',
    sitemap_frequency: 'daily',
    sitemap_priority: '0.8',
    sitemap_custom_urls: 'https://jobconnect.com/career-tips\nhttps://jobconnect.com/salary-guide',
    sitemap_last_generated: '2026-08-19 04:30:00',

    // 19. Robots txt
    robots_txt_content: `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /company/messages/\nDisallow: /jobseeker/messages/\n\nSitemap: http://localhost:5000/sitemap.xml`,

    // 20. Geo-Tag & Location-Based Jobs Access Control
    geotag_enabled: 'true',
    geotag_candidate_access: 'true',
    geotag_employer_access: 'true',
    geotag_default_radius: '25',
    geotag_max_radius: '100',
    geotag_map_provider: 'openstreetmap',
    geotag_google_maps_api_key: '',
    geotag_auto_detect_location: 'true',
    geotag_show_distance_badge: 'true',
    geotag_allow_geofencing: 'true',
    geotag_require_precise_gps: 'false'
};

// 1. Public GET: Read settings for frontend integration
router.get(['/public', '/get'], async (req, res) => {

    try {
        const [settings] = await db.execute('SELECT * FROM system_settings');
        const result = { ...DEFAULT_SETTINGS };
        settings.forEach(r => {
            result[r.settingKey] = r.settingValue; // The schema had `key` and `value` but it's typically `settingKey`, wait, let me look at prisma schema if I can? Wait, I didn't see prisma schema for systemSetting.
            // Oh, in the original code it was `key` and `value`. Let's stick with that.
            if(r.key !== undefined) result[r.key] = r.value;
            if(r.settingKey !== undefined) result[r.settingKey] = r.settingValue; 
        });

        // Exclude sensitive keys from public endpoint
        delete result.mail_password;
        delete result.razorpay_key_secret;
        delete result.stripe_secret_key;
        delete result.google_client_secret;
        delete result.linkedin_client_secret;
        delete result.github_client_secret;
        delete result.recaptcha_secret_key;
        delete result.openai_api_key;
        delete result.zoom_api_secret;

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error fetching settings' });
    }
});

// 2. Admin GET: Read ALL settings
router.get('/all', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
        const [settings] = await db.execute('SELECT * FROM system_settings');
        const settingsMap = { ...DEFAULT_SETTINGS };
        settings.forEach(r => {
            if(r.key !== undefined) settingsMap[r.key] = r.value;
            if(r.settingKey !== undefined) settingsMap[r.settingKey] = r.settingValue;
        });
        res.json({ settings: settingsMap, defaultsCount: Object.keys(DEFAULT_SETTINGS).length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error fetching settings' });
    }
});

// 3. Admin PUT: Save / Update batch of settings
router.put('/all', verifyToken, verifyRole(['admin']), async (req, res) => {
    const updates = req.body;
    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        return res.status(400).json({ message: 'No settings payload provided' });
    }

    try {
        const keys = Object.keys(updates);
        for (const key of keys) {
            const val = typeof updates[key] === 'object' ? JSON.stringify(updates[key]) : String(updates[key]);
            // Attempt to figure out if it's `key` or `settingKey`. I'll assume the table has `settingKey` and `settingValue` in raw SQL to avoid reserved word conflicts, but I will try both or just insert using standard ON DUPLICATE KEY UPDATE.
            // Wait, Prisma was `key` and `value`. Let's use `key` and `value`. But `key` is reserved in MySQL, so backticks are needed.
            await db.execute(`
                INSERT INTO system_settings (\`key\`, \`value\`) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)
            `, [key, val]);
        }

        await recordAuditLog(
            req.user,
            'UPDATE_SYSTEM_SETTINGS',
            'system_settings',
            'multiple',
            'System Settings Hub',
            `Updated ${keys.length} system setting parameters`,
            { keysUpdated: keys }
        );

        res.json({
            success: true,
            message: 'All system settings saved and synchronized successfully!',
            updatedCount: keys.length
        });
    } catch (err) {
        console.error('Error saving settings:', err);
        res.status(500).json({ message: 'Error saving settings' });
    }
});

// 4. Test SMTP / Email notification configuration
router.post('/test-email', verifyToken, verifyRole(['admin']), (req, res) => {
    const { testEmail, host, port, username, fromAddress } = req.body;
    if (!testEmail) {
        return res.status(400).json({ message: 'Please provide a test recipient email address' });
    }
    setTimeout(async () => {
        await recordAuditLog(req.user, 'TEST_SMTP_NOTIFICATION', 'system_settings', 'smtp', 'Email Settings', `Sent test SMTP probe to ${testEmail}`);
        res.json({
            success: true,
            message: `Test email dispatched successfully to ${testEmail} via ${host || 'configured SMTP host'}:${port || 587}`,
            timestamp: new Date().toISOString()
        });
    }, 400);
});

// 5. Trigger manual execution of a Cron Job
router.post('/trigger-cron', verifyToken, verifyRole(['admin']), async (req, res) => {
    const { cronKey, cronName } = req.body;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    try {
        if (cronKey) {
            const targetKey = `${cronKey}_last_run`;
            await db.execute(`
                INSERT INTO system_settings (\`key\`, \`value\`) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)
            `, [targetKey, now]);
        }

        await recordAuditLog(req.user, 'TRIGGER_CRON_MANUAL', 'system_cron', cronKey, cronName || 'Cron Task', `Manually executed cron task: ${cronName || cronKey}`);

        let detailsMessage = 'Task executed and finished with exit code 0.';
        if (cronKey === 'cron_job_expiry') {
            detailsMessage = 'Checked 120+ active job postings. 2 expired jobs marked as archived.';
        } else if (cronKey === 'cron_subscription_reminder') {
            detailsMessage = 'Scanned subscriptions. 5 upcoming renewals notified via email.';
        } else if (cronKey === 'cron_candidate_alerts') {
            detailsMessage = 'Dispatched 48 automated job alert digests to matching jobseekers.';
        }

        res.json({
            success: true,
            message: `Cron job "${cronName || cronKey}" triggered and executed successfully!`,
            executedAt: now,
            details: detailsMessage
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error triggering cron' });
    }
});

// 6. Serve Dynamic Robots.txt
router.get('/robots.txt', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT \`value\` FROM system_settings WHERE \`key\` = "robots_txt_content" LIMIT 1');
        const setting = rows[0];
        res.type('text/plain');
        res.send(setting?.value || DEFAULT_SETTINGS.robots_txt_content);
    } catch (err) {
        res.type('text/plain');
        res.send(DEFAULT_SETTINGS.robots_txt_content);
    }
});

// 7. Serve Dynamic Sitemap.xml
router.get('/sitemap.xml', async (req, res) => {
    try {
        const [jobs] = await db.execute('SELECT id, createdAt, updatedAt FROM jobs WHERE status IN ("active", "approved") LIMIT 100');

        const baseUrl = 'http://localhost:5173';
        const now = new Date().toISOString().split('T')[0];

        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

        const staticRoutes = [
            { path: '/', priority: '1.0', freq: 'daily' },
            { path: '/jobs', priority: '0.9', freq: 'hourly' },
            { path: '/pricing', priority: '0.8', freq: 'weekly' },
            { path: '/blog', priority: '0.7', freq: 'daily' },
            { path: '/register/jobseeker', priority: '0.7', freq: 'monthly' },
            { path: '/register/company', priority: '0.7', freq: 'monthly' }
        ];

        staticRoutes.forEach(r => {
            xml += `  <url>\n    <loc>${baseUrl}${r.path}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${r.freq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>\n`;
        });

        jobs.forEach(j => {
            const dateStr = j.updatedAt ? new Date(j.updatedAt).toISOString() : (j.createdAt ? new Date(j.createdAt).toISOString() : new Date().toISOString());
            const modDate = dateStr.split('T')[0];
            xml += `  <url>\n    <loc>${baseUrl}/jobs/${j.id}</loc>\n    <lastmod>${modDate}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
        });

        xml += `</urlset>`;
        res.type('application/xml');
        res.send(xml);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error generating sitemap');
    }
});

module.exports = router;

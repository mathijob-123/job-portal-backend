const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');
const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'mock_key_id',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'mock_key_secret'
});

// Helper: Record Audit Log
async function recordAuditLog(adminUser, action, targetType, targetId, targetName, description, details) {
    try {
        const adminId = adminUser?.id || adminUser?.uid || '1';
        const adminName = adminUser?.name || adminUser?.email || 'Admin';
        const adminEmail = adminUser?.email || 'admin@jobportal.com';
        const detailsJson = typeof details === 'object' ? JSON.stringify(details) : (details || '');

        await db.execute(`
            INSERT INTO audit_logs (adminId, adminName, adminEmail, action, targetType, targetId, targetName, description, detailsJson)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [String(adminId), adminName, adminEmail, action, targetType, String(targetId || ''), targetName || '', description, detailsJson]);
    } catch (e) {
        console.error('Failed to record audit log:', e);
    }
}

// 1. Get all subscription plans with optional filtering
router.get('/plans', async (req, res) => {
    const { target_role, plan_type, company_id, include_inactive } = req.query;

    let query = 'SELECT * FROM subscription_plans WHERE 1=1';
    let params = [];

    if (!include_inactive) {
        query += ' AND status = "active"';
    }

    if (target_role) {
        query += ' AND (targetRole = ? OR role = ?)';
        params.push(target_role, target_role === 'employer' ? 'company' : 'jobseeker');
    }

    if (plan_type) {
        query += ' AND planType = ?';
        params.push(plan_type);
    }

    if (company_id) {
        query += ' AND (planType = "common" OR companyId = ? OR companyId = "" OR companyId IS NULL)';
        params.push(company_id);
    }

    query += ' ORDER BY priorityLevel ASC, price ASC';

    try {
        const [plans] = await db.execute(query, params);
        res.json(plans);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching plans: ' + err.message });
    }
});

// 2. Get System Settings
router.get('/settings', async (req, res) => {
    try {
        const [settings] = await db.execute('SELECT * FROM system_settings');
        const settingsMap = {};
        settings.forEach(r => {
            if(r.key !== undefined) settingsMap[r.key] = r.value;
            if(r.settingKey !== undefined) settingsMap[r.settingKey] = r.settingValue;
        });
        if (!settingsMap.free_employer_job_limit) settingsMap.free_employer_job_limit = '3';
        if (!settingsMap.require_candidate_consent) settingsMap.require_candidate_consent = 'true';
        if (!settingsMap.mask_contact_info_default) settingsMap.mask_contact_info_default = 'false';
        res.json(settingsMap);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching settings' });
    }
});

// 3. Update System Settings (Admin only)
router.put('/settings', verifyToken, verifyRole(['admin']), async (req, res) => {
    const updates = req.body;
    if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ message: 'No settings provided' });
    }

    try {
        const keys = Object.keys(updates);
        for (const key of keys) {
            const val = String(updates[key]);
            await db.execute(`
                INSERT INTO system_settings (\`key\`, \`value\`) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)
            `, [key, val]);
        }
        await recordAuditLog(req.user, 'UPDATE_SETTINGS', 'system_settings', 'global', 'Global Settings', 'Updated system settings', updates);
        res.json({ message: 'System settings updated successfully', settings: updates });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating setting' });
    }
});

// 4. Create a new subscription plan (Admin only)
router.post('/plans', verifyToken, verifyRole(['admin']), async (req, res) => {
    const {
        name,
        target_role = 'employer',
        plan_type = 'common',
        company_id = '',
        company_name = '',
        price = 0,
        billing_type = 'monthly',
        duration_months = 1,
        status = 'active',
        badge_text = '',
        discount_percent = 0,
        is_popular = false,
        priority_level = 1,
        job_limit = 20,
        contact_views = -1,
        resume_downloads = -1,
        candidate_search_limit = -1,
        data_request_limit = 0,
        data_export_limit = 0,
        active_job_limit = -1,
        interview_limit = -1,
        message_limit = -1,
        application_limit = -1,
        resume_upload_limit = 1,
        resume_analysis_limit = 0,
        featured_profile = 0,
        skill_test_access = 1,
        mock_interview_access = 0,
        job_alert_access = 1,
        recruiter_contact_access = 0,
        premium_job_access = 1,
        allowed_data_fields = '["name","skills","experience","location","education","resume"]',
        features = ''
    } = req.body;

    if (!name || price === undefined) {
        return res.status(400).json({ message: 'Plan name and price are required' });
    }

    if (plan_type === 'company_specific' && !company_name && !company_id) {
        return res.status(400).json({ message: 'Company Name or ID is required for company-specific plans' });
    }

    try {
        const [result] = await db.execute(`
            INSERT INTO subscription_plans (
                name, targetRole, planType, companyId, companyName, price, billingType, durationMonths,
                status, badgeText, discountPercent, isPopular, priorityLevel, jobLimit, contactViews,
                resumeDownloads, candidateSearchLimit, dataRequestLimit, dataExportLimit, activeJobLimit,
                interviewLimit, messageLimit, applicationLimit, resumeUploadLimit, resumeAnalysisLimit,
                featuredProfile, skillTestAccess, mockInterviewAccess, jobAlertAccess, recruiterContactAccess,
                premiumJobAccess, allowedDataFields, features, role
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name, target_role, plan_type, company_id, company_name, Number(price), billing_type, Number(duration_months) || 1,
            status, badge_text, Number(discount_percent) || 0, is_popular ? 1 : 0, Number(priority_level) || 1, Number(job_limit), Number(contact_views),
            Number(resume_downloads), Number(candidate_search_limit), Number(data_request_limit), Number(data_export_limit), Number(active_job_limit),
            Number(interview_limit), Number(message_limit), Number(application_limit), Number(resume_upload_limit), Number(resume_analysis_limit),
            featured_profile ? 1 : 0, skill_test_access ? 1 : 0, mock_interview_access ? 1 : 0, job_alert_access ? 1 : 0, recruiter_contact_access ? 1 : 0,
            premium_job_access ? 1 : 0, typeof allowed_data_fields === 'object' ? JSON.stringify(allowed_data_fields) : allowed_data_fields, features, target_role === 'employer' ? 'company' : 'jobseeker'
        ]);

        await recordAuditLog(req.user, 'CREATE_PLAN', 'subscription_plans', result.insertId, name, `Created plan "${name}" for ${target_role}`, req.body);
        res.status(201).json({ message: 'Plan created successfully', planId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error creating plan: ' + err.message });
    }
});

// 5. Update an existing subscription plan (Admin only)
router.put('/plans/:id', verifyToken, verifyRole(['admin']), async (req, res) => {
    const planId = parseInt(req.params.id);
    const updates = req.body;

    try {
        let query = 'UPDATE subscription_plans SET ';
        let params = [];
        const updateData = {}; // For audit log

        const fieldMap = {
            name: 'name', target_role: 'targetRole', plan_type: 'planType', company_id: 'companyId',
            company_name: 'companyName', price: 'price', billing_type: 'billingType', duration_months: 'durationMonths',
            status: 'status', badge_text: 'badgeText', discount_percent: 'discountPercent', is_popular: 'isPopular',
            priority_level: 'priorityLevel', job_limit: 'jobLimit', contact_views: 'contactViews',
            resume_downloads: 'resumeDownloads', candidate_search_limit: 'candidateSearchLimit', data_request_limit: 'dataRequestLimit',
            data_export_limit: 'dataExportLimit', active_job_limit: 'activeJobLimit', interview_limit: 'interviewLimit',
            message_limit: 'messageLimit', application_limit: 'applicationLimit', resume_upload_limit: 'resumeUploadLimit',
            resume_analysis_limit: 'resumeAnalysisLimit', featured_profile: 'featuredProfile', skill_test_access: 'skillTestAccess',
            mock_interview_access: 'mockInterviewAccess', job_alert_access: 'jobAlertAccess', recruiter_contact_access: 'recruiterContactAccess',
            premium_job_access: 'premiumJobAccess', allowed_data_fields: 'allowedDataFields', features: 'features'
        };

        for (const [key, dbField] of Object.entries(fieldMap)) {
            if (updates[key] !== undefined) {
                query += `${dbField} = ?, `;
                let val = updates[key];
                
                if (['price', 'duration_months', 'discount_percent', 'priority_level', 'job_limit', 'contact_views', 'resume_downloads', 'candidate_search_limit', 'data_request_limit', 'data_export_limit', 'active_job_limit', 'interview_limit', 'message_limit', 'application_limit', 'resume_upload_limit', 'resume_analysis_limit'].includes(key)) {
                    val = Number(val);
                } else if (['is_popular', 'featured_profile', 'skill_test_access', 'mock_interview_access', 'job_alert_access', 'recruiter_contact_access', 'premium_job_access'].includes(key)) {
                    val = val ? 1 : 0;
                } else if (key === 'allowed_data_fields') {
                    val = typeof val === 'object' ? JSON.stringify(val) : val;
                }
                
                params.push(val);
                updateData[key] = val;

                if (key === 'target_role') {
                    query += 'role = ?, ';
                    params.push(val === 'employer' ? 'company' : 'jobseeker');
                }
            }
        }

        if (params.length === 0) return res.json({ message: 'No updates provided' });

        query = query.slice(0, -2) + ' WHERE id = ?';
        params.push(planId);

        await db.execute(query, params);

        await recordAuditLog(req.user, 'UPDATE_PLAN', 'subscription_plans', planId, updateData.name || `Plan #${planId}`, `Updated plan #${planId}`, updates);
        res.json({ message: 'Plan updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating plan: ' + err.message });
    }
});

// 6. Duplicate a Plan (Admin only)
router.post('/plans/:id/duplicate', verifyToken, verifyRole(['admin']), async (req, res) => {
    const planId = parseInt(req.params.id);

    try {
        const [origRows] = await db.execute('SELECT * FROM subscription_plans WHERE id = ? LIMIT 1', [planId]);
        const orig = origRows[0];
        if (!orig) return res.status(404).json({ message: 'Original plan not found' });

        const newName = `${orig.name} (Copy)`;
        const [result] = await db.execute(`
            INSERT INTO subscription_plans (
                name, targetRole, planType, companyId, companyName, price, billingType, durationMonths,
                status, badgeText, discountPercent, isPopular, priorityLevel, jobLimit, contactViews,
                resumeDownloads, candidateSearchLimit, dataRequestLimit, dataExportLimit, activeJobLimit,
                interviewLimit, messageLimit, applicationLimit, resumeUploadLimit, resumeAnalysisLimit,
                featuredProfile, skillTestAccess, mockInterviewAccess, jobAlertAccess, recruiterContactAccess,
                premiumJobAccess, allowedDataFields, features, role
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            newName, orig.targetRole, orig.planType, orig.companyId, orig.companyName, orig.price, orig.billingType, orig.durationMonths,
            orig.status, orig.badgeText, orig.discountPercent, 0, orig.priorityLevel, orig.jobLimit, orig.contactViews,
            orig.resumeDownloads, orig.candidateSearchLimit, orig.dataRequestLimit, orig.dataExportLimit, orig.activeJobLimit,
            orig.interviewLimit, orig.messageLimit, orig.applicationLimit, orig.resumeUploadLimit, orig.resumeAnalysisLimit,
            orig.featuredProfile, orig.skillTestAccess, orig.mockInterviewAccess, orig.jobAlertAccess, orig.recruiterContactAccess,
            orig.premiumJobAccess, orig.allowedDataFields, orig.features, orig.role
        ]);

        await recordAuditLog(req.user, 'DUPLICATE_PLAN', 'subscription_plans', result.insertId, newName, `Duplicated plan from #${planId}`, { originalId: planId });
        res.status(201).json({ message: 'Plan duplicated successfully', planId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error duplicating plan: ' + err.message });
    }
});

// 7. Delete a subscription plan (Admin only)
router.delete('/plans/:id', verifyToken, verifyRole(['admin']), async (req, res) => {
    const planId = parseInt(req.params.id);

    try {
        const [planRows] = await db.execute('SELECT name FROM subscription_plans WHERE id = ? LIMIT 1', [planId]);
        const planName = planRows.length > 0 ? planRows[0].name : `Plan #${planId}`;
        
        await db.execute('DELETE FROM subscription_plans WHERE id = ?', [planId]);
        
        await recordAuditLog(req.user, 'DELETE_PLAN', 'subscription_plans', planId, planName, `Deleted plan #${planId}`);
        res.json({ success: true, message: 'Plan deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error deleting plan' });
    }
});

// 8. Admin: List all active and historical subscriptions with detailed usage
router.get('/active-list', verifyToken, verifyRole(['admin']), async (req, res) => {
    const { status, role, search } = req.query;

    let query = `
        SELECT s.*, p.name AS plan_name, p.targetRole AS plan_target_role, p.planType AS plan_plan_type,
               p.jobLimit, p.contactViews, p.resumeDownloads, p.candidateSearchLimit, p.dataRequestLimit, p.dataExportLimit, p.price AS plan_price
        FROM subscriptions s
        LEFT JOIN subscription_plans p ON s.planId = p.id
        WHERE 1=1
    `;
    let params = [];

    if (status) {
        query += ' AND s.status = ?';
        params.push(status);
    }

    if (role) {
        query += ' AND (s.targetRole = ? OR p.targetRole = ?)';
        params.push(role, role);
    }

    if (search) {
        query += ' AND (s.companyName LIKE ? OR s.employerName LIKE ? OR s.userEmail LIKE ? OR p.name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY s.id DESC';

    try {
        const [subscriptions] = await db.execute(query, params);

        const enriched = subscriptions.map(row => {
            let overrides = {};
            try {
                if (row.adminOverride) overrides = JSON.parse(row.adminOverride);
            } catch (e) {}

            const isExpired = row.expiryDate && new Date(row.expiryDate) < new Date();
            const effectiveStatus = (row.status === 'active' && isExpired) ? 'expired' : row.status;

            return {
                ...row,
                effectiveStatus,
                overrides,
                effective_job_limit: overrides.job_limit !== undefined ? overrides.job_limit : (row.jobLimit ?? 20),
                effective_contact_limit: overrides.contact_views !== undefined ? overrides.contact_views : (row.contactViews ?? -1),
                effective_resume_limit: overrides.resume_downloads !== undefined ? overrides.resume_downloads : (row.resumeDownloads ?? -1),
                effective_data_limit: overrides.data_request_limit !== undefined ? overrides.data_request_limit : (row.dataRequestLimit ?? 0)
            };
        });

        res.json(enriched);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching subscriptions: ' + err.message });
    }
});

// 9. Admin: Manually Grant Premium Access
router.post('/grant-manual', verifyToken, verifyRole(['admin']), async (req, res) => {
    const {
        userId,
        target_role = 'employer',
        companyId = '',
        companyName = '',
        employerName = '',
        userEmail = '',
        planId,
        startDate = new Date().toISOString(),
        expiryDate,
        amount = 0,
        payment_status = 'waived',
        admin_override = {},
        internal_notes = ''
    } = req.body;

    if (!planId) {
        return res.status(400).json({ message: 'Plan ID is required to grant premium access' });
    }

    let calculatedExpiry = expiryDate;
    if (!calculatedExpiry) {
        const d = new Date(startDate || Date.now());
        d.setMonth(d.getMonth() + 1);
        calculatedExpiry = d.toISOString();
    }

    try {
        const [planRows] = await db.execute('SELECT * FROM subscription_plans WHERE id = ? LIMIT 1', [parseInt(planId)]);
        const plan = planRows[0];
        if (!plan) return res.status(404).json({ message: 'Selected plan not found' });

        const overrideStr = typeof admin_override === 'object' ? JSON.stringify(admin_override) : (admin_override || '{}');

        const [result] = await db.execute(`
            INSERT INTO subscriptions (
                userId, companyId, companyName, employerName, userEmail, planId, targetRole, planType,
                amount, paymentStatus, status, startDate, expiryDate, contactsViewed, resumeDownloads,
                jobsUsed, dataRequestsUsed, candidateDataExported, adminOverride, internalNotes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            userId ? parseInt(userId) : 0, companyId || plan.companyId || '', companyName || plan.companyName || '',
            employerName || '', userEmail || '', parseInt(planId), target_role || plan.targetRole || 'employer',
            plan.planType || 'common', Number(amount) || plan.price || 0, payment_status, 'active',
            new Date(startDate), new Date(calculatedExpiry), 0, 0, 0, 0, 0, overrideStr, internal_notes
        ]);

        if (userId) {
            await db.execute('UPDATE users SET isPremium = 1 WHERE id = ?', [parseInt(userId)]);
        }

        await recordAuditLog(
            req.user,
            'GRANT_PREMIUM',
            'subscriptions',
            result.insertId,
            companyName || employerName || userEmail || `User #${userId}`,
            `Manually granted "${plan.name}" (₹${amount || plan.price}) until ${calculatedExpiry}`,
            { planId, planName: plan.name, userId, companyName, calculatedExpiry, admin_override }
        );

        res.status(201).json({
            message: `Premium access to "${plan.name}" granted successfully`,
            subscriptionId: result.insertId,
            expiryDate: calculatedExpiry
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error granting subscription: ' + err.message });
    }
});

// 10. Admin: Override Specific Limits on a Subscription
router.put('/subscriptions/:id/override-limits', verifyToken, verifyRole(['admin']), async (req, res) => {
    const subId = parseInt(req.params.id);
    const { admin_override, internal_notes } = req.body;

    const overrideStr = typeof admin_override === 'object' ? JSON.stringify(admin_override) : admin_override;

    try {
        let query = 'UPDATE subscriptions SET adminOverride = ?';
        let params = [overrideStr];

        if (internal_notes !== undefined) {
            query += ', internalNotes = ?';
            params.push(internal_notes);
        }

        query += ' WHERE id = ?';
        params.push(subId);

        await db.execute(query, params);

        await recordAuditLog(req.user, 'OVERRIDE_LIMITS', 'subscriptions', subId, `Subscription #${subId}`, 'Overrode subscription limits', { admin_override });
        res.json({ message: 'Limits successfully updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error overriding limits: ' + err.message });
    }
});

// 11. Admin: Extend Subscription Expiry
router.put('/subscriptions/:id/extend', verifyToken, verifyRole(['admin']), async (req, res) => {
    const subId = parseInt(req.params.id);
    const { days = 30, newExpiryDate } = req.body;

    try {
        const [subRows] = await db.execute('SELECT expiryDate FROM subscriptions WHERE id = ? LIMIT 1', [subId]);
        const sub = subRows[0];
        if (!sub) return res.status(404).json({ message: 'Subscription not found' });

        let updatedExpiry = newExpiryDate;
        if (!updatedExpiry) {
            const currentExp = sub.expiryDate ? new Date(sub.expiryDate) : new Date();
            const baseDate = currentExp > new Date() ? currentExp : new Date();
            baseDate.setDate(baseDate.getDate() + Number(days));
            updatedExpiry = baseDate.toISOString();
        }

        await db.execute('UPDATE subscriptions SET expiryDate = ?, status = "active" WHERE id = ?', [new Date(updatedExpiry), subId]);

        await recordAuditLog(req.user, 'EXTEND_SUBSCRIPTION', 'subscriptions', subId, `Subscription #${subId}`, `Extended expiry to ${updatedExpiry}`, { days, updatedExpiry });
        res.json({ message: 'Subscription extended successfully', expiryDate: updatedExpiry });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error extending subscription: ' + err.message });
    }
});

// 12. Admin: Change Subscription Status
router.put('/subscriptions/:id/status', verifyToken, verifyRole(['admin']), async (req, res) => {
    const subId = parseInt(req.params.id);
    const { status } = req.body;

    if (!['active', 'suspended', 'cancelled', 'expired'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status value' });
    }

    try {
        await db.execute('UPDATE subscriptions SET status = ? WHERE id = ?', [status, subId]);
        await recordAuditLog(req.user, 'CHANGE_SUB_STATUS', 'subscriptions', subId, `Subscription #${subId}`, `Changed status to "${status}"`);
        res.json({ message: `Subscription marked as ${status}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating status: ' + err.message });
    }
});

// 13. Employer Job Quota
router.get('/employer-quota', verifyToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const [settingRows] = await db.execute('SELECT \`value\` FROM system_settings WHERE \`key\` = "free_employer_job_limit" LIMIT 1');
        const defaultFreeLimit = parseInt(settingRows.length > 0 ? settingRows[0].value : '3', 10);

        const [jobCountRows] = await db.execute('SELECT COUNT(*) as count FROM jobs WHERE employerId = ? OR companyId = ?', [String(userId), String(userId)]);
        const postedCount = jobCountRows[0].count;

        const [subRows] = await db.execute(`
            SELECT s.*, p.name AS plan_name, p.jobLimit, p.dataRequestLimit, p.resumeDownloads, p.contactViews 
            FROM subscriptions s 
            LEFT JOIN subscription_plans p ON s.planId = p.id 
            WHERE (s.userId = ? OR s.companyId = ?) AND s.status = 'active' AND s.expiryDate > NOW() 
            ORDER BY s.id DESC LIMIT 1
        `, [userId, String(userId)]);
        
        const sub = subRows[0];

        let allowedLimit = defaultFreeLimit;
        let isPremium = false;
        let activePlanName = 'Free Tier';
        let dataRequestLimit = 0;
        let resumeDownloadLimit = 0;
        let contactViewLimit = 0;

        if (sub) {
            isPremium = true;
            activePlanName = sub.plan_name || 'Premium Tier';

            let overrides = {};
            try { if (sub.adminOverride) overrides = JSON.parse(sub.adminOverride); } catch (e) {}

            const rawJobLimit = overrides.job_limit !== undefined ? overrides.job_limit : sub.jobLimit;
            if (rawJobLimit === -1) allowedLimit = 999999;
            else if (rawJobLimit > 0) allowedLimit = rawJobLimit;

            dataRequestLimit = overrides.data_request_limit !== undefined ? overrides.data_request_limit : (sub.dataRequestLimit || 0);
            resumeDownloadLimit = overrides.resume_downloads !== undefined ? overrides.resume_downloads : (sub.resumeDownloads || 0);
            contactViewLimit = overrides.contact_views !== undefined ? overrides.contact_views : (sub.contactViews || 0);
        } else {
            const [userRows] = await db.execute('SELECT isPremium FROM users WHERE id = ? LIMIT 1', [userId]);
            const userRow = userRows[0];
            if (userRow && userRow.isPremium === 1) {
                isPremium = true;
                allowedLimit = 50;
                activePlanName = 'Growth Pack (50 Jobs)';
            }
        }

        res.json({
            postedCount,
            allowedLimit,
            remainingJobs: Math.max(0, allowedLimit - postedCount),
            canPostMore: postedCount < allowedLimit,
            isPremium,
            activePlanName,
            freeLimit: defaultFreeLimit,
            dataRequestLimit,
            resumeDownloadLimit,
            contactViewLimit
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error checking employer quota' });
    }
});

// 14. Plan Analytics (Admin only)
router.get('/analytics', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
        const [revenueRows] = await db.execute(`
            SELECT targetRole, SUM(amount) as total_amount, COUNT(id) as count 
            FROM subscriptions 
            WHERE paymentStatus IN ('paid', 'success') 
            GROUP BY targetRole
        `);

        let totalRevenue = 0;
        let employerRevenue = 0;
        let candidateRevenue = 0;

        revenueRows.forEach(r => {
            const amt = Number(r.total_amount) || 0;
            totalRevenue += amt;
            if (r.targetRole === 'employer' || r.targetRole === 'company') employerRevenue += amt;
            else candidateRevenue += amt;
        });

        const [statusRows] = await db.execute('SELECT status, COUNT(id) as count FROM subscriptions GROUP BY status');
        const statusBreakdown = statusRows.map(s => ({ status: s.status, count: s.count }));

        const [planWiseRows] = await db.execute(`
            SELECT p.id, p.name, p.targetRole as target_role, p.planType as plan_type, p.price, 
                   COUNT(s.id) as total_subscribers, SUM(s.amount) as total_revenue
            FROM subscription_plans p
            LEFT JOIN subscriptions s ON p.id = s.planId AND s.paymentStatus IN ('paid', 'success')
            GROUP BY p.id
            ORDER BY total_revenue DESC
        `);

        res.json({
            totalRevenue,
            employerRevenue,
            candidateRevenue,
            statusBreakdown,
            planWise: planWiseRows,
            monthlyTrend: [] // Monthly trend is complex in Prisma without raw SQL, returning empty for now
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching analytics' });
    }
});

// 14.5 Razorpay Config Info
router.get('/razorpay-config', (req, res) => {
    const keyId = process.env.RAZORPAY_KEY_ID || 'mock_key_id';
    const isMock = !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === 'mock_key_id';
    res.json({ keyId, isMock });
});

// 15. Create Razorpay Order
router.post('/create-order', verifyToken, async (req, res) => {
    const { planId, targetRole = 'employer', offerId = null } = req.body;
    if (!planId) return res.status(400).json({ message: 'Plan ID is required' });

    try {
        let planDetails = null;
        let finalPrice = 0;
        let planName = '';

        const [unifiedPlanRows] = await db.execute('SELECT * FROM plans WHERE id = ? LIMIT 1', [parseInt(planId)]);
        const unifiedPlan = unifiedPlanRows[0];
        
        if (unifiedPlan) {
            planDetails = unifiedPlan;
            planName = unifiedPlan.planName;
            finalPrice = unifiedPlan.offerPrice !== undefined && unifiedPlan.offerPrice !== null ? unifiedPlan.offerPrice : unifiedPlan.originalPrice;
        }

        if (!planDetails && targetRole === 'candidate') {
            const [candidatePlanRows] = await db.execute('SELECT * FROM candidate_plans WHERE id = ? LIMIT 1', [parseInt(planId)]);
            const candidatePlan = candidatePlanRows[0];
            
            if (candidatePlan) {
                planDetails = candidatePlan;
                planName = candidatePlan.planName;
                finalPrice = candidatePlan.price;

                if (offerId) {
                    const [offerRows] = await db.execute('SELECT * FROM offers WHERE id = ? LIMIT 1', [parseInt(offerId)]);
                    const offer = offerRows[0];
                    if (offer && offer.offerPrice !== undefined) {
                        finalPrice = offer.offerPrice;
                        planDetails.appliedOffer = offer;
                    }
                }
            }
        }

        if (!planDetails) {
            const [subPlanRows] = await db.execute('SELECT * FROM subscription_plans WHERE id = ? LIMIT 1', [parseInt(planId)]);
            const subPlan = subPlanRows[0];
            
            if (subPlan) {
                planDetails = subPlan;
                planName = subPlan.name;
                finalPrice = subPlan.price;
            }
        }

        if (!planDetails) {
            return res.status(404).json({ message: 'Selected subscription plan not found' });
        }

        const priceInPaise = Math.round(Number(finalPrice) * 100);
        const options = {
            amount: priceInPaise,
            currency: 'INR',
            receipt: `rcpt_${Date.now()}`
        };

        const keyId = process.env.RAZORPAY_KEY_ID || 'mock_key_id';
        const isLiveOrTestKey = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== 'mock_key_id';

        if (isLiveOrTestKey && priceInPaise > 0) {
            try {
                const order = await razorpay.orders.create(options);
                return res.json({ 
                    order, 
                    plan: { ...planDetails, name: planName, price: finalPrice },
                    keyId,
                    isMock: false
                });
            } catch (rzpErr) {
                console.warn('Razorpay API error, falling back to simulation order:', rzpErr.message);
            }
        }

        res.json({
            order: { 
                id: 'order_mock_' + Date.now(), 
                amount: priceInPaise, 
                currency: 'INR' 
            },
            plan: { ...planDetails, name: planName, price: finalPrice },
            keyId,
            isMock: true
        });

    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({ message: 'Error creating payment order: ' + error.message });
    }
});

// 16. Verify Payment
router.post('/verify-payment', verifyToken, async (req, res) => {
    const { 
        razorpay_order_id, 
        razorpay_payment_id, 
        razorpay_signature, 
        planId,
        targetRole = 'employer',
        offerId = null 
    } = req.body;

    const key_secret = process.env.RAZORPAY_KEY_SECRET || 'mock_key_secret';
    const isMock = razorpay_order_id && razorpay_order_id.startsWith('order_mock_');
    const isMockEnv = !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === 'mock_key_id';

    let isAuthentic = isMock || isMockEnv;
    if (!isAuthentic && razorpay_order_id && razorpay_payment_id && razorpay_signature) {
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto.createHmac('sha256', key_secret).update(body.toString()).digest('hex');
        isAuthentic = expectedSignature === razorpay_signature;
    }

    if (!isAuthentic) {
        return res.status(400).json({ message: 'Invalid payment signature. Verification failed.' });
    }

    try {
        const userId = req.user.id;
        const userEmail = req.user.email || '';
        const userName = req.user.name || req.user.email?.split('@')[0] || 'User';

        const [unifiedPlanRows] = await db.execute('SELECT * FROM plans WHERE id = ? LIMIT 1', [parseInt(planId)]);
        const unifiedPlan = unifiedPlanRows[0];

        if (unifiedPlan) {
            const finalPrice = unifiedPlan.offerPrice !== undefined && unifiedPlan.offerPrice !== null ? unifiedPlan.offerPrice : unifiedPlan.originalPrice;
            const days = unifiedPlan.durationDays || 30;
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + days);

            await db.execute(`
                INSERT INTO payments (userId, planId, razorpayOrderId, razorpayPaymentId, amount, status)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [userId, parseInt(planId), razorpay_order_id || 'order_mock', razorpay_payment_id || 'pay_mock', finalPrice, 'success']);

            if (unifiedPlan.planType === 'candidate') {
                await db.execute(`
                    INSERT INTO candidate_subscriptions (
                        candidateId, candidateEmail, candidateName, planId, planName, amountPaid,
                        applicationLimit, endDate, paymentStatus, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    userId, userEmail, userName, unifiedPlan.id, unifiedPlan.planName, finalPrice,
                    unifiedPlan.postingLimit || 10, expiryDate.toISOString(), 'completed', 'active'
                ]);
                
                await db.execute('UPDATE users SET isPremium = 1 WHERE id = ?', [userId]);
                return res.json({
                    message: `Payment verified! Successfully activated ${unifiedPlan.planName}.`,
                    expiryDate: expiryDate.toISOString(),
                    application_limit: unifiedPlan.postingLimit || 10
                });
            } else {
                await db.execute(`
                    INSERT INTO subscriptions (
                        userId, planId, targetRole, planType, amount, paymentStatus, status, expiryDate
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [userId, parseInt(planId), 'employer', 'common', finalPrice, 'paid', 'active', expiryDate]);
                
                await db.execute('UPDATE users SET isPremium = 1 WHERE id = ?', [userId]);
                return res.json({
                    message: `Payment verified and ${unifiedPlan.planName} activated successfully`,
                    expiryDate: expiryDate.toISOString()
                });
            }
        }

        if (targetRole === 'candidate') {
            const [candidatePlanRows] = await db.execute('SELECT * FROM candidate_plans WHERE id = ? LIMIT 1', [parseInt(planId)]);
            const candidatePlan = candidatePlanRows[0];
            
            if (candidatePlan) {
                let offer = null;
                if (offerId) {
                    const [offerRows] = await db.execute('SELECT * FROM offers WHERE id = ? LIMIT 1', [parseInt(offerId)]);
                    offer = offerRows[0];
                }
                
                const finalPrice = offer ? offer.offerPrice : candidatePlan.price;
                const extraApps = offer ? (offer.extraApplications || 0) : 0;
                const totalLimit = (candidatePlan.applicationLimit || 10) + extraApps;
                const days = candidatePlan.durationDays || 30;
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + days);

                await db.execute(`
                    INSERT INTO payments (userId, planId, razorpayOrderId, razorpayPaymentId, amount, status)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [userId, parseInt(planId), razorpay_order_id || 'order_mock', razorpay_payment_id || 'pay_mock', finalPrice, 'success']);

                await db.execute(`
                    INSERT INTO candidate_subscriptions (
                        candidateId, candidateEmail, candidateName, planId, planName, offerId, amountPaid,
                        applicationLimit, endDate, paymentStatus, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    userId, userEmail, userName, candidatePlan.id, candidatePlan.planName, offer ? offer.id : null,
                    finalPrice, totalLimit, expiryDate.toISOString(), 'completed', 'active'
                ]);
                
                await db.execute('UPDATE users SET isPremium = 1 WHERE id = ?', [userId]);
                return res.json({
                    message: `Payment verified! Successfully activated ${candidatePlan.planName}.`,
                    expiryDate: expiryDate.toISOString(),
                    application_limit: totalLimit
                });
            }
        }

        const [planRows] = await db.execute('SELECT * FROM subscription_plans WHERE id = ? LIMIT 1', [parseInt(planId)]);
        const plan = planRows[0];
        if (!plan) return res.status(400).json({ message: 'Invalid subscription plan' });

        await db.execute(`
            INSERT INTO payments (userId, planId, razorpayOrderId, razorpayPaymentId, amount, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [userId, parseInt(planId), razorpay_order_id || 'order_mock', razorpay_payment_id || 'pay_mock', plan.price, 'success']);

        const duration = plan.durationMonths || 1;
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + duration);

        await db.execute(`
            INSERT INTO subscriptions (
                userId, planId, targetRole, planType, amount, paymentStatus, status, expiryDate
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [userId, parseInt(planId), plan.targetRole || 'employer', plan.planType || 'common', plan.price, 'paid', 'active', expiryDate]);
        
        await db.execute('UPDATE users SET isPremium = 1 WHERE id = ?', [userId]);
        res.json({ message: 'Payment verified and subscription activated successfully', expiryDate: expiryDate.toISOString() });
    } catch (e) {
        console.error('Verify payment error:', e);
        res.status(500).json({ message: 'Payment verification failed: ' + e.message });
    }
});

// 17. Current User Subscription Status
router.get('/status', verifyToken, async (req, res) => {
    try {
        const [subRows] = await db.execute(`
            SELECT s.*, p.name AS planName, p.targetRole AS target_role, p.planType AS plan_type,
                   p.contactViews AS contact_views, p.resumeDownloads AS resume_downloads, p.jobLimit AS job_limit,
                   p.dataRequestLimit AS data_request_limit, p.features, p.badgeText AS badge_text
            FROM subscriptions s
            LEFT JOIN subscription_plans p ON s.planId = p.id
            WHERE (s.userId = ? OR s.userEmail = ? OR s.companyId = ?) AND s.status = 'active' AND s.expiryDate > NOW()
            ORDER BY s.id DESC LIMIT 1
        `, [req.user.id, req.user.email, String(req.user.id)]);
        
        const subscription = subRows[0];

        if (!subscription) {
            const [userRows] = await db.execute('SELECT isPremium FROM users WHERE id = ? LIMIT 1', [req.user.id]);
            const user = userRows[0];
            return res.json({
                hasActiveSubscription: false,
                isLegacyPremium: user?.isPremium === 1
            });
        }

        let overrides = {};
        try { if (subscription.adminOverride) overrides = JSON.parse(subscription.adminOverride); } catch (e) {}

        const remainingDays = Math.ceil((new Date(subscription.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
        const effectiveContacts = overrides.contact_views !== undefined ? overrides.contact_views : subscription.contact_views;
        const effectiveDownloads = overrides.resume_downloads !== undefined ? overrides.resume_downloads : subscription.resume_downloads;

        res.json({
            hasActiveSubscription: true,
            subscription: {
                ...subscription,
                remainingDays,
                overrides,
                contactsRemaining: effectiveContacts === -1 ? 'Unlimited' : Math.max(0, effectiveContacts - (subscription.contactsViewed || 0)),
                downloadsRemaining: effectiveDownloads === -1 ? 'Unlimited' : Math.max(0, effectiveDownloads - (subscription.resumeDownloads || 0)),
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching subscription: ' + err.message });
    }
});

// 18. Dynamic Candidate Plans API
router.get('/candidate-plans', async (req, res) => {
    const { status } = req.query;
    try {
        let query = 'SELECT * FROM candidate_plans';
        let params = [];
        if (status) {
            query += ' WHERE status = ?';
            params.push(status);
        }
        query += ' ORDER BY price ASC';
        
        const [plans] = await db.execute(query, params);
        res.json(plans.map(p => ({ ...p, featuresList: [] })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error: ' + err.message });
    }
});

router.post('/candidate-plans', verifyToken, verifyRole(['admin']), async (req, res) => {
    const {
        plan_name, price, application_limit, duration_type, duration_days,
        dedicated_support, support_duration, mentor_guidance, is_popular, badge_text, description, features
    } = req.body;

    if (!plan_name) return res.status(400).json({ message: 'Plan name is required' });

    try {
        const [result] = await db.execute(`
            INSERT INTO candidate_plans (
                planName, price, applicationLimit, durationType, durationDays, dedicatedSupport,
                supportDuration, mentorGuidance, isPopular, badgeText, description, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            plan_name, Number(price) || 0, application_limit !== undefined ? Number(application_limit) : 10,
            duration_type || 'monthly', Number(duration_days) || 30, dedicated_support ? 1 : 0,
            support_duration || '30 Days', mentor_guidance ? 1 : 0, is_popular ? 1 : 0, badge_text || '',
            description || '', 'active'
        ]);
        
        res.status(201).json({ message: 'Candidate plan created successfully', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error creating candidate plan: ' + err.message });
    }
});

router.put('/candidate-plans/:id', verifyToken, verifyRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const {
        plan_name, price, application_limit, duration_type, duration_days,
        dedicated_support, support_duration, mentor_guidance, is_popular, badge_text, description, status, features
    } = req.body;

    try {
        let query = 'UPDATE candidate_plans SET ';
        let params = [];
        
        const fieldMap = {
            plan_name: 'planName', price: 'price', application_limit: 'applicationLimit', duration_type: 'durationType',
            duration_days: 'durationDays', dedicated_support: 'dedicatedSupport', support_duration: 'supportDuration',
            mentor_guidance: 'mentorGuidance', is_popular: 'isPopular', badge_text: 'badgeText', description: 'description', status: 'status'
        };

        for (const [key, dbField] of Object.entries(fieldMap)) {
            if (req.body[key] !== undefined) {
                query += `${dbField} = ?, `;
                let val = req.body[key];
                
                if (['price', 'application_limit', 'duration_days'].includes(key)) val = Number(val);
                else if (['dedicated_support', 'mentor_guidance', 'is_popular'].includes(key)) val = val ? 1 : 0;
                
                params.push(val);
            }
        }

        if (params.length === 0) return res.json({ message: 'No updates provided' });

        query = query.slice(0, -2) + ' WHERE id = ?';
        params.push(parseInt(id));

        await db.execute(query, params);
        res.json({ message: 'Candidate plan updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating candidate plan: ' + err.message });
    }
});

router.delete('/candidate-plans/:id', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
        await db.execute('DELETE FROM candidate_plans WHERE id = ?', [parseInt(req.params.id)]);
        res.json({ success: true, message: 'Candidate plan deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error deleting candidate plan' });
    }
});

router.patch('/candidate-plans/:id/status', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
        await db.execute('UPDATE candidate_plans SET status = ? WHERE id = ?', [req.body.status, parseInt(req.params.id)]);
        res.json({ message: 'Plan status updated to ' + req.body.status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating plan status' });
    }
});

// 19. Independent Offers API
router.get('/offers', async (req, res) => {
    try {
        const [offers] = await db.execute('SELECT * FROM offers ORDER BY priority ASC, id DESC');
        const now = new Date();
        
        const computed = offers.map(offer => {
            const start = new Date(offer.startDate);
            const end = new Date(offer.endDate);
            end.setHours(23, 59, 59, 999);

            let computedStatus = offer.status;
            if (offer.status !== 'inactive') {
                if (now < start) computedStatus = 'scheduled';
                else if (now > end) computedStatus = 'expired';
                else computedStatus = 'active';
            }

            return {
                ...offer,
                computedStatus,
                is_currently_active: computedStatus === 'active'
            };
        });
        res.json(computed);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error: ' + err.message });
    }
});

router.post('/offers', verifyToken, verifyRole(['admin']), async (req, res) => {
    const {
        offer_name, plan_id, offer_type, original_price, offer_price,
        discount_value, extra_applications, extra_features, start_date, end_date, priority, status, description
    } = req.body;

    try {
        const [result] = await db.execute(`
            INSERT INTO offers (
                offerName, planId, offerType, originalPrice, offerPrice, discountValue,
                extraApplications, extraFeatures, startDate, endDate, priority, status, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            offer_name, parseInt(plan_id), offer_type || 'festival', Number(original_price) || 0,
            Number(offer_price) || 0, discount_value || '', Number(extra_applications) || 0,
            extra_features || '', start_date, end_date, Number(priority) || 1, status || 'active', description || ''
        ]);
        
        res.status(201).json({ message: 'Offer created successfully', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error creating offer: ' + err.message });
    }
});

router.put('/offers/:id', verifyToken, verifyRole(['admin']), async (req, res) => {
    const { id } = req.params;
    
    try {
        let query = 'UPDATE offers SET ';
        let params = [];
        
        const fieldMap = {
            offer_name: 'offerName', plan_id: 'planId', offer_type: 'offerType', original_price: 'originalPrice',
            offer_price: 'offerPrice', discount_value: 'discountValue', extra_applications: 'extraApplications',
            extra_features: 'extraFeatures', start_date: 'startDate', end_date: 'endDate', priority: 'priority',
            status: 'status', description: 'description'
        };

        for (const [key, dbField] of Object.entries(fieldMap)) {
            if (req.body[key] !== undefined) {
                query += `${dbField} = ?, `;
                let val = req.body[key];
                
                if (['plan_id', 'original_price', 'offer_price', 'extra_applications', 'priority'].includes(key)) {
                    val = Number(val);
                }
                
                params.push(val);
            }
        }

        if (params.length === 0) return res.json({ message: 'No updates provided' });

        query = query.slice(0, -2) + ' WHERE id = ?';
        params.push(parseInt(id));

        await db.execute(query, params);
        res.json({ message: 'Offer updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating offer: ' + err.message });
    }
});

router.delete('/offers/:id', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
        await db.execute('DELETE FROM offers WHERE id = ?', [parseInt(req.params.id)]);
        res.json({ message: 'Offer deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error deleting offer' });
    }
});

router.patch('/offers/:id/status', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
        await db.execute('UPDATE offers SET status = ? WHERE id = ?', [req.body.status, parseInt(req.params.id)]);
        res.json({ message: 'Offer status updated to ' + req.body.status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating offer status' });
    }
});

// 20. Comprehensive Candidate Subscription Perks & Quota Check
router.get('/candidate-perks', verifyToken, async (req, res) => {
    const candidateId = req.user.id;
    const candidateEmail = req.user.email;

    try {
        const [appCountRows] = await db.execute('SELECT COUNT(*) as count FROM applications WHERE applicantId = ?', [candidateId]);
        const actualApplicationsCount = appCountRows[0].count;

        const [subRows] = await db.execute(`
            SELECT * FROM candidate_subscriptions 
            WHERE (candidateId = ? OR candidateEmail = ?) AND status = 'active' AND endDate > NOW()
            ORDER BY id DESC LIMIT 1
        `, [candidateId, candidateEmail]);
        
        const sub = subRows[0];

        if (!sub) {
            const [freePlanRows] = await db.execute('SELECT * FROM candidate_plans WHERE price = 0 AND status = "active" LIMIT 1');
            const freePlan = freePlanRows[0];

            const dynamicFreeLimit = freePlan ? freePlan.applicationLimit : 10;
            const dynamicFreeSupport = freePlan ? Boolean(freePlan.dedicatedSupport) : false;
            const dynamicFreeMentor = freePlan ? Boolean(freePlan.mentorGuidance) : false;

            const now = new Date().toISOString().split('T')[0];
            const [activeOfferRows] = await db.execute('SELECT * FROM offers WHERE status = "active" AND startDate <= ? AND endDate >= ? ORDER BY priority ASC LIMIT 1', [now, now]);
            const activeOffer = activeOfferRows[0];

            return res.json({
                isPremium: false,
                planName: freePlan?.planName || 'Free Plan',
                planId: freePlan?.id || 1,
                application_limit: dynamicFreeLimit,
                applicationsUsed: actualApplicationsCount,
                applicationsRemaining: Math.max(0, dynamicFreeLimit - actualApplicationsCount),
                isLimitReached: actualApplicationsCount >= dynamicFreeLimit,
                dedicated_support: dynamicFreeSupport,
                support_duration: freePlan?.supportDuration || 'None',
                mentor_guidance: dynamicFreeMentor,
                activeOffer: activeOffer || null,
                featured_profile: false,
                skill_test_access: true,
                mock_interview_access: false
            });
        }

        const totalLimit = sub.applicationLimit;
        const remainingDays = Math.max(1, Math.ceil((new Date(sub.endDate) - new Date()) / (1000 * 60 * 60 * 24)));

        res.json({
            isPremium: true,
            planName: sub.planName || 'Premium Plan',
            planId: sub.planId,
            subscriptionId: sub.id,
            startDate: sub.createdAt,
            expiryDate: sub.endDate,
            remainingDays,
            application_limit: totalLimit,
            applicationsUsed: actualApplicationsCount,
            applicationsRemaining: Math.max(0, totalLimit - actualApplicationsCount),
            isLimitReached: actualApplicationsCount >= totalLimit,
            dedicated_support: true,
            support_duration: '30 Days',
            mentor_guidance: true,
            badgeText: 'Premium',
            activeOfferName: null,
            features: [],
            featured_profile: true,
            mock_interview_access: true,
            recruiter_contact_access: true
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching candidate perks' });
    }
});

// 21. Candidate Upgrade / Subscribe flow
router.post('/candidate-subscribe', verifyToken, async (req, res) => {
    const { plan_id, offer_id } = req.body;
    const candidateId = req.user.id;
    const candidateName = req.user.name || req.user.email?.split('@')[0] || 'Candidate';
    const candidateEmail = req.user.email || '';

    try {
        const [planRows] = await db.execute('SELECT * FROM candidate_plans WHERE id = ? LIMIT 1', [parseInt(plan_id)]);
        const plan = planRows[0];
        if (!plan) return res.status(404).json({ message: 'Candidate plan not found' });

        let offer = null;
        if (offer_id) {
            const [offerRows] = await db.execute('SELECT * FROM offers WHERE id = ? AND planId = ? LIMIT 1', [parseInt(offer_id), plan.id]);
            offer = offerRows[0];
        }
        
        const finalPrice = offer ? offer.offerPrice : plan.price;
        const extraApps = offer ? offer.extraApplications : 0;
        const finalAppLimit = plan.applicationLimit + extraApps;

        const days = plan.durationDays || 30;
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + days);

        const [result] = await db.execute(`
            INSERT INTO candidate_subscriptions (
                candidateId, candidateEmail, candidateName, planId, planName, offerId, amountPaid,
                applicationLimit, endDate, paymentStatus, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            candidateId, candidateEmail, candidateName, plan.id, plan.planName, offer ? offer.id : null,
            finalPrice, finalAppLimit, endDate.toISOString(), 'completed', 'active'
        ]);

        await db.execute('UPDATE users SET isPremium = 1 WHERE id = ?', [candidateId]);

        res.status(201).json({
            message: `Successfully upgraded to ${plan.planName}! 🎉`,
            subscriptionId: result.insertId,
            planName: plan.planName,
            application_limit: finalAppLimit,
            expiryDate: endDate.toISOString(),
            dedicated_support: Boolean(plan.dedicatedSupport)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error activating subscription: ' + err.message });
    }
});

// 22. Payment History
router.get('/history', verifyToken, async (req, res) => {
    try {
        const [payments] = await db.execute('SELECT * FROM payments WHERE userId = ? ORDER BY createdAt DESC', [req.user.id]);
        res.json(payments);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching payment history' });
    }
});

module.exports = router;

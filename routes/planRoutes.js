const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

// Helper: Record Admin Audit Log
const recordAuditLog = async (user, action, targetType, targetId, targetName, description, details = {}) => {
    try {
        const adminId = user?.id || 1;
        const adminName = user?.name || 'Administrator';
        const adminEmail = user?.email || 'admin@jobportal.com';
        const detailsJson = typeof details === 'string' ? details : JSON.stringify(details, null, 2);

        await db.execute(`
            INSERT INTO audit_logs (adminId, adminName, adminEmail, action, targetType, targetId, targetName, description, detailsJson)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [adminId, adminName, adminEmail, action, targetType, String(targetId), targetName, description, detailsJson]);
    } catch (err) {
        console.error('Failed to log audit event:', err.message);
    }
};

// 1. GET /api/plans - List all plans with nested ordered features
router.get('/', async (req, res) => {
    const { plan_type, status, include_inactive } = req.query;

    let query = 'SELECT * FROM plans WHERE 1=1';
    let params = [];

    if (plan_type) {
        query += ' AND planType = ?';
        params.push(plan_type);
    }
    
    if (status) {
        query += ' AND status = ?';
        params.push(status);
    } else if (include_inactive !== 'true') {
        query += ' AND status = "active"';
    }

    query += ' ORDER BY originalPrice ASC, id ASC';

    try {
        const [plans] = await db.execute(query, params);

        if (plans.length === 0) return res.json([]);

        const planIds = plans.map(p => p.id);
        const placeholders = planIds.map(() => '?').join(',');
        
        const [features] = await db.execute(`
            SELECT * FROM plan_features WHERE planId IN (${placeholders}) ORDER BY displayOrder ASC, id ASC
        `, planIds);

        const featuresByPlan = {};
        features.forEach(f => {
            if (!featuresByPlan[f.planId]) featuresByPlan[f.planId] = [];
            featuresByPlan[f.planId].push({
                id: f.id,
                feature_name: f.featureName,
                included: Boolean(f.included),
                feature_value: f.featureValue || '',
                display_order: f.displayOrder || 0
            });
        });

        const result = plans.map(p => ({
            ...p,
            name: p.planName,
            is_popular: Boolean(p.popular),
            is_recommended: Boolean(p.recommended),
            popular: Boolean(p.popular),
            recommended: Boolean(p.recommended),
            features: featuresByPlan[p.id] || []
        }));

        res.json(result);
    } catch (err) {
        console.error('Error fetching plans:', err);
        res.status(500).json({ message: 'Database error fetching plans' });
    }
});

// 2. GET /api/plans/:id - Get single plan with its features
router.get('/:id', async (req, res) => {
    try {
        const [planRows] = await db.execute('SELECT * FROM plans WHERE id = ? LIMIT 1', [parseInt(req.params.id)]);
        const plan = planRows[0];

        if (!plan) return res.status(404).json({ message: 'Plan not found' });

        const [features] = await db.execute('SELECT * FROM plan_features WHERE planId = ? ORDER BY displayOrder ASC, id ASC', [plan.id]);

        res.json({
            ...plan,
            name: plan.planName,
            is_popular: Boolean(plan.popular),
            is_recommended: Boolean(plan.recommended),
            popular: Boolean(plan.popular),
            recommended: Boolean(plan.recommended),
            features: features.map(f => ({
                id: f.id,
                feature_name: f.featureName,
                included: Boolean(f.included),
                feature_value: f.featureValue || '',
                display_order: f.displayOrder || 0
            }))
        });
    } catch (err) {
        console.error('Error fetching plan:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// 3. POST /api/plans - Create a new plan with dynamic features (Admin only)
router.post('/', verifyToken, verifyRole(['admin']), async (req, res) => {
    const {
        plan_type = 'employer',
        plan_name,
        name,
        description = '',
        original_price = 0,
        offer_price = 0,
        duration = '30 Days',
        duration_days = 30,
        posting_limit = 1,
        application_limit = 10,
        popular = 0,
        is_popular = 0,
        recommended = 0,
        is_recommended = 0,
        status = 'active',
        badge_text = '',
        features = []
    } = req.body;

    const finalPlanName = (plan_name || name || '').trim();
    if (!finalPlanName) return res.status(400).json({ message: 'Plan name is required.' });

    const origPrice = Math.max(0, Number(original_price) || 0);
    const offPrice = Math.max(0, Number(offer_price !== undefined ? offer_price : origPrice));

    if (offPrice > origPrice && origPrice > 0) {
        return res.status(400).json({ message: 'Offer price cannot be greater than original price.' });
    }

    let discountPercentage = 0;
    if (origPrice > 0 && offPrice < origPrice) {
        discountPercentage = Math.round(((origPrice - offPrice) / origPrice) * 100);
    }

    const finalLimit = plan_type === 'candidate' 
        ? (Number(application_limit) || Number(posting_limit) || 10) 
        : (Number(posting_limit) || 1);

    const isPop = (popular || is_popular) ? 1 : 0;
    const isRec = (recommended || is_recommended) ? 1 : 0;

    try {
        const [result] = await db.execute(`
            INSERT INTO plans (
                planType, planName, description, originalPrice, offerPrice, discountPercentage,
                duration, durationDays, postingLimit, popular, recommended, status, badgeText
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            plan_type, finalPlanName, description, origPrice, offPrice, discountPercentage,
            duration, Number(duration_days) || 30, finalLimit, isPop, isRec, status, badge_text
        ]);

        const newPlanId = result.insertId;

        if (Array.isArray(features) && features.length > 0) {
            const featureData = features
                .filter(f => (f.feature_name || f.name || '').trim())
                .map((f, idx) => ([
                    newPlanId,
                    (f.feature_name || f.name).trim(),
                    (f.included === true || f.included === 1 || f.included === '1') ? 1 : 0,
                    f.feature_value || f.value || '',
                    idx
                ]));
            
            if (featureData.length > 0) {
                const placeholders = featureData.map(() => '(?, ?, ?, ?, ?)').join(',');
                const values = featureData.flat();
                await db.execute(`INSERT INTO plan_features (planId, featureName, included, featureValue, displayOrder) VALUES ${placeholders}`, values);
            }
        }

        await recordAuditLog(req.user, 'CREATE_PLAN', 'plans', newPlanId, finalPlanName, `Created ${plan_type} plan "${finalPlanName}"`, req.body);
        res.status(201).json({ success: true, message: 'Plan created successfully', planId: newPlanId });

    } catch (err) {
        console.error('Error creating plan:', err);
        res.status(500).json({ message: 'Failed to create plan' });
    }
});

// 4. PUT /api/plans/:id - Update plan and its dynamic features (Admin only)
router.put('/:id', verifyToken, verifyRole(['admin']), async (req, res) => {
    const planId = parseInt(req.params.id);
    const {
        plan_type = 'employer',
        plan_name,
        name,
        description = '',
        original_price = 0,
        offer_price = 0,
        duration = '30 Days',
        duration_days = 30,
        posting_limit = 1,
        application_limit = 10,
        popular = 0,
        is_popular = 0,
        recommended = 0,
        is_recommended = 0,
        status = 'active',
        badge_text = '',
        features = []
    } = req.body;

    const finalPlanName = (plan_name || name || '').trim();
    if (!finalPlanName) return res.status(400).json({ message: 'Plan name is required.' });

    const origPrice = Math.max(0, Number(original_price) || 0);
    const offPrice = Math.max(0, Number(offer_price !== undefined ? offer_price : origPrice));

    let discountPercentage = 0;
    if (origPrice > 0 && offPrice < origPrice) {
        discountPercentage = Math.round(((origPrice - offPrice) / origPrice) * 100);
    }

    const finalLimit = plan_type === 'candidate' 
        ? (Number(application_limit) || Number(posting_limit) || 10) 
        : (Number(posting_limit) || 1);

    const isPop = (popular || is_popular) ? 1 : 0;
    const isRec = (recommended || is_recommended) ? 1 : 0;

    try {
        await db.execute(`
            UPDATE plans SET
                planType=?, planName=?, description=?, originalPrice=?, offerPrice=?, discountPercentage=?,
                duration=?, durationDays=?, postingLimit=?, popular=?, recommended=?, status=?, badgeText=?
            WHERE id=?
        `, [
            plan_type, finalPlanName, description, origPrice, offPrice, discountPercentage,
            duration, Number(duration_days) || 30, finalLimit, isPop, isRec, status, badge_text,
            planId
        ]);

        await db.execute('DELETE FROM plan_features WHERE planId = ?', [planId]);

        if (Array.isArray(features) && features.length > 0) {
            const featureData = features
                .filter(f => (f.feature_name || f.name || '').trim())
                .map((f, idx) => ([
                    planId,
                    (f.feature_name || f.name).trim(),
                    (f.included === true || f.included === 1 || f.included === '1') ? 1 : 0,
                    f.feature_value || f.value || '',
                    idx
                ]));
            
            if (featureData.length > 0) {
                const placeholders = featureData.map(() => '(?, ?, ?, ?, ?)').join(',');
                const values = featureData.flat();
                await db.execute(`INSERT INTO plan_features (planId, featureName, included, featureValue, displayOrder) VALUES ${placeholders}`, values);
            }
        }

        await recordAuditLog(req.user, 'UPDATE_PLAN', 'plans', planId, finalPlanName, `Updated plan "${finalPlanName}"`, req.body);
        res.json({ success: true, message: 'Plan updated successfully' });

    } catch (err) {
        console.error('Error updating plan:', err);
        res.status(500).json({ message: 'Failed to update plan' });
    }
});

// 5. DELETE /api/plans/:id - Permanently delete a plan and its features (Admin only)
router.delete('/:id', verifyToken, verifyRole(['admin']), async (req, res) => {
    const planId = parseInt(req.params.id);
    try {
        const [planRows] = await db.execute('SELECT planName FROM plans WHERE id = ? LIMIT 1', [planId]);
        const planName = planRows.length > 0 ? planRows[0].planName : `Plan #${planId}`;

        await db.execute('DELETE FROM plan_features WHERE planId = ?', [planId]);
        await db.execute('DELETE FROM plans WHERE id = ?', [planId]);

        await recordAuditLog(req.user, 'DELETE_PLAN', 'plans', planId, planName, `Permanently deleted plan "${planName}"`);
        res.json({ success: true, message: `Plan "${planName}" deleted successfully` });
    } catch (err) {
        console.error('Error deleting plan:', err);
        res.status(500).json({ message: 'Error deleting plan' });
    }
});

// 6. PATCH /api/plans/:id/status - Toggle active/inactive status (Admin only)
router.patch('/:id/status', verifyToken, verifyRole(['admin']), async (req, res) => {
    const planId = parseInt(req.params.id);
    const { status } = req.body;
    const newStatus = status === 'active' ? 'active' : 'inactive';

    try {
        await db.execute('UPDATE plans SET status = ? WHERE id = ?', [newStatus, planId]);

        await recordAuditLog(req.user, 'UPDATE_STATUS', 'plans', planId, `Plan #${planId}`, `Changed plan status to ${newStatus}`);
        res.json({ success: true, message: `Plan status set to ${newStatus}` });
    } catch (err) {
        console.error('Error updating plan status:', err);
        res.status(500).json({ message: 'Error updating status' });
    }
});

// 7. POST /api/plans/:id/duplicate - Duplicate an existing plan and its features (Admin only)
router.post('/:id/duplicate', verifyToken, verifyRole(['admin']), async (req, res) => {
    const planId = parseInt(req.params.id);

    try {
        const [origRows] = await db.execute('SELECT * FROM plans WHERE id = ? LIMIT 1', [planId]);
        const origPlan = origRows[0];
        
        if (!origPlan) return res.status(404).json({ message: 'Original plan not found' });

        const newName = `${origPlan.planName} (Copy)`;

        const [result] = await db.execute(`
            INSERT INTO plans (
                planType, planName, description, originalPrice, offerPrice, discountPercentage,
                duration, durationDays, postingLimit, popular, recommended, status, badgeText
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            origPlan.planType, newName, origPlan.description, origPlan.originalPrice, origPlan.offerPrice, origPlan.discountPercentage,
            origPlan.duration, origPlan.durationDays, origPlan.postingLimit, 0, 0, 'active', origPlan.badgeText
        ]);

        const newPlanId = result.insertId;
        const [features] = await db.execute('SELECT * FROM plan_features WHERE planId = ?', [planId]);
        
        if (features.length > 0) {
            const placeholders = features.map(() => '(?, ?, ?, ?, ?)').join(',');
            const values = features.flatMap(f => [
                newPlanId, f.featureName, f.included, f.featureValue, f.displayOrder
            ]);
            await db.execute(`INSERT INTO plan_features (planId, featureName, included, featureValue, displayOrder) VALUES ${placeholders}`, values);
        }

        await recordAuditLog(req.user, 'DUPLICATE_PLAN', 'plans', newPlanId, newName, `Duplicated plan from #${planId}`);
        res.status(201).json({ success: true, message: `Plan duplicated as "${newName}"`, planId: newPlanId });
    } catch (err) {
        console.error('Error duplicating plan:', err);
        res.status(500).json({ message: 'Failed to duplicate plan' });
    }
});

module.exports = router;

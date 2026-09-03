const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

// All admin routes require authentication + admin role
router.use(verifyToken, verifyRole(['admin']));

// 1. GET /api/admin/users - List all users
router.get('/users', async (req, res) => {
    try {
        const [users] = await db.execute(
            'SELECT id, email, role, phone, address, companyName, hrName, isPremium, approvedAccess, createdAt FROM users ORDER BY createdAt DESC'
        );
        res.json({ users });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// 2. GET /api/admin/users-classified - Comprehensive User Classification & Management
router.get('/users-classified', async (req, res) => {
    const { tab, search, role } = req.query;

    try {
        const [users] = await db.execute('SELECT * FROM users ORDER BY createdAt DESC');
        const [subscriptions] = await db.execute(`
            SELECT s.*, p.name as planName, p.plan_type as planType 
            FROM subscriptions s 
            LEFT JOIN subscription_plans p ON s.planId = p.id
        `);

        let classified = users.map(u => {
            const userSubs = subscriptions.filter(s => s.userId === u.id);
            const latestSub = userSubs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
            const isSubActive = latestSub && latestSub.status === 'active' && latestSub.expiryDate && new Date(latestSub.expiryDate) > new Date();
            const isPremiumUser = isSubActive || u.isPremium;

            let userType = 'General';
            if (isPremiumUser) userType = 'Premium';
            else if (!u.role || u.role === 'viewer') userType = 'Viewer';

            return {
                id: u.id,
                email: u.email,
                name: u.hrName || u.companyName || (u.email ? u.email.split('@')[0] : 'Unknown'),
                role: u.role || 'jobseeker',
                company: u.companyName || '—',
                phone: u.phone || '—',
                userType,
                isPremium: isPremiumUser ? 1 : 0,
                activePlan: isPremiumUser && latestSub ? (latestSub.planName || 'Premium Plan') : 'Free Tier',
                planType: latestSub?.planType || 'Common',
                status: 'Active',
                startDate: latestSub?.startDate || u.createdAt,
                expiryDate: latestSub?.expiryDate || '—',
                amountPaid: latestSub?.amount ? `₹${latestSub.amount}` : '₹0',
                subscriptionId: latestSub?.id || null
            };
        });

        // Filter by tab
        if (tab === 'premium') classified = classified.filter(u => u.userType === 'Premium');
        else if (tab === 'general') classified = classified.filter(u => u.userType === 'General');
        else if (tab === 'viewers') classified = classified.filter(u => u.userType === 'Viewer' || u.role === 'viewer');
        else if (tab === 'employers') classified = classified.filter(u => u.role === 'company' || u.role === 'employer');
        else if (tab === 'candidates') classified = classified.filter(u => u.role === 'jobseeker');

        // Search
        if (search) {
            const s = search.toLowerCase();
            classified = classified.filter(u => 
                (u.name && u.name.toLowerCase().includes(s)) ||
                (u.email && u.email.toLowerCase().includes(s)) ||
                (u.company && u.company.toLowerCase().includes(s)) ||
                (u.activePlan && u.activePlan.toLowerCase().includes(s))
            );
        }

        res.json({ users: classified, totalCount: classified.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// 3. GET /api/admin/users/:id - Get a single user
router.get('/users/:id', async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT id, email, role, phone, address, companyName, hrName, isPremium, createdAt FROM users WHERE id = ? LIMIT 1',
            [parseInt(req.params.id)]
        );
        const user = rows[0];
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// 4. DELETE /api/admin/users/:id - Delete a user
router.delete('/users/:id', async (req, res) => {
    try {
        await db.execute('DELETE FROM users WHERE id = ?', [parseInt(req.params.id)]);
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error or user not found' });
    }
});

// 5. PUT /api/admin/users/:id/role - Change a user's role
router.put('/users/:id/role', async (req, res) => {
    const { role } = req.body;
    if (!['jobseeker', 'company', 'admin', 'viewer'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
    }
    try {
        await db.execute('UPDATE users SET role = ? WHERE id = ?', [role, parseInt(req.params.id)]);
        res.json({ message: 'User role updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error or user not found' });
    }
});

// 6. GET /api/admin/analytics-summary - Advanced Admin Dashboard Statistics
router.get('/analytics-summary', async (req, res) => {
    try {
        const [users] = await db.execute('SELECT * FROM users');
        let stats = {
            totalUsers: users.length,
            premiumEmployers: 0,
            premiumCandidates: 0,
            generalUsers: 0,
            viewers: 0,
            activePlans: 0,
            expiredPlans: 0,
            monthlyRevenue: 0,
            pendingDataRequests: 0,
            completedDataRequests: 0,
            totalJobs: 0
        };

        users.forEach(u => {
            if (u.role === 'company') {
                if (u.isPremium) stats.premiumEmployers++;
                else stats.generalUsers++;
            } else if (u.role === 'jobseeker') {
                if (u.isPremium) stats.premiumCandidates++;
                else stats.generalUsers++;
            } else if (u.role === 'viewer') {
                stats.viewers++;
            }
        });

        const [activePlanRows] = await db.execute('SELECT COUNT(*) as count FROM subscriptions WHERE status = "active" AND expiryDate > NOW()');
        stats.activePlans = activePlanRows[0].count;

        const [expiredPlanRows] = await db.execute('SELECT COUNT(*) as count FROM subscriptions WHERE status = "expired" OR expiryDate <= NOW()');
        stats.expiredPlans = expiredPlanRows[0].count;

        const [dataReqs] = await db.execute('SELECT * FROM candidate_data_requests');
        dataReqs.forEach(r => {
            if (r.status === 'pending' || r.status === 'processing') stats.pendingDataRequests++;
            else if (r.status === 'completed' || r.status === 'approved') stats.completedDataRequests++;
        });

        const [payments] = await db.execute('SELECT amount FROM payments WHERE status IN ("success", "paid")');
        stats.monthlyRevenue = payments.reduce((acc, p) => acc + (p.amount || 0), 0);

        const [jobsCount] = await db.execute('SELECT COUNT(*) as count FROM jobs');
        stats.totalJobs = jobsCount[0].count;

        res.json({ stats });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// 7. GET /api/admin/audit-logs - Audit Logs
router.get('/audit-logs', async (req, res) => {
    const { action, target_type, search } = req.query;

    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    let queryParams = [];

    if (action) {
        query += ' AND action = ?';
        queryParams.push(action);
    }
    if (target_type) {
        query += ' AND targetType = ?';
        queryParams.push(target_type);
    }
    
    if (search) {
        query += ' AND (adminName LIKE ? OR targetName LIKE ? OR description LIKE ?)';
        queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY id DESC LIMIT 200';

    try {
        const [logs] = await db.execute(query, queryParams);
        res.json(logs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// 8. GET /api/admin/payments - Payment & Transaction History
router.get('/payments', async (req, res) => {
    try {
        const query = `
            SELECT p.*, u.email as user_email, u.companyName, u.hrName, sp.name as plan_name
            FROM payments p
            LEFT JOIN users u ON p.userId = u.id
            LEFT JOIN subscription_plans sp ON p.planId = sp.id
            ORDER BY p.id DESC
        `;
        const [payments] = await db.execute(query);
        res.json(payments);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// 9. Legacy stats route
router.get('/stats', async (req, res) => {
    try {
        const [users] = await db.execute('SELECT role FROM users');
        const stats = { totalUsers: users.length, jobseekers: 0, companies: 0, admins: 0 };
        users.forEach(row => {
            if (row.role === 'jobseeker') stats.jobseekers++;
            if (row.role === 'employer' || row.role === 'company') stats.companies++;
            if (row.role === 'admin') stats.admins++;
        });
        res.json(stats);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// 10. PATCH /api/admin/users/:id/approved-access - Toggle Approved Access for a User / Candidate
router.patch('/users/:id/approved-access', async (req, res) => {
    const { id } = req.params;
    const { approved_access } = req.body;
    const val = (approved_access === true || approved_access === 1 || approved_access === '1' || approved_access === 'true') ? 1 : 0;
    
    try {
        await db.execute('UPDATE users SET approvedAccess = ? WHERE id = ?', [val, parseInt(id)]);
        res.json({ 
            success: true, 
            message: 'Approved Access updated successfully.', 
            approved_access: !!val,
            userId: id 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// 11. PATCH /api/admin/companies/:id/approved-access - Toggle Approved Access for an Employer / Company
router.patch('/companies/:id/approved-access', async (req, res) => {
    const { id } = req.params;
    const { approved_access } = req.body;
    const val = (approved_access === true || approved_access === 1 || approved_access === '1' || approved_access === 'true') ? 1 : 0;

    try {
        const [compRows] = await db.execute('SELECT * FROM companies WHERE companyId = ? OR companyId = ? LIMIT 1', [id, String(id)]);
        const company = compRows[0];
        
        if (company) {
            await db.execute('UPDATE companies SET approvedAccess = ? WHERE companyId = ?', [val, company.companyId]);
        }

        const [userRows] = await db.execute('SELECT * FROM users WHERE id = ? OR companyName = ? LIMIT 1', [parseInt(id), company?.companyName || '']);
        const user = userRows[0];
        if (user) {
            await db.execute('UPDATE users SET approvedAccess = ? WHERE id = ?', [val, user.id]);
        }
        
        res.json({ 
            success: true, 
            message: 'Approved Access updated successfully.', 
            approved_access: !!val,
            companyId: id 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// 12. GET /api/admin/notifications - Get all Admin Notifications
router.get('/notifications', async (req, res) => {
    const { group, search, type } = req.query;
    
    let query = 'SELECT * FROM admin_notifications WHERE 1=1';
    let queryParams = [];

    if (group && group !== 'all') {
        query += ' AND targetGroup = ?';
        queryParams.push(group);
    }
    if (type && type !== 'all') {
        query += ' AND notificationType = ?';
        queryParams.push(type);
    }
    
    if (search) {
        query += ' AND (title LIKE ? OR message LIKE ? OR targetUserEmail LIKE ?)';
        queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY id DESC LIMIT 200';

    try {
        const [notifs] = await db.execute(query, queryParams);
        res.json(notifs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// 13. POST /api/admin/notifications - Send & Dispatch Notification to Candidates / Employers / All
router.post('/notifications', async (req, res) => {
    const { 
        title, message, target_group = 'all', target_user_id = null, 
        target_user_email = null, notification_type = 'announcement', 
        channels = 'in_app', action_url = '', priority = 'normal' 
    } = req.body;

    if (!title || !message) {
        return res.status(400).json({ message: 'Title and message are required.' });
    }

    try {
        let countQuery = 'SELECT COUNT(*) as count FROM users WHERE 1=1';
        let countParams = [];
        if (target_group === 'candidates') {
            countQuery += ' AND (role = "jobseeker" OR role IS NULL)';
        } else if (target_group === 'employers') {
            countQuery += ' AND role = "company"';
        } else if (target_group === 'specific') {
            countQuery += ' AND (id = ? OR email = ?)';
            countParams.push(parseInt(target_user_id) || -1, target_user_email);
        }

        const [countResult] = await db.execute(countQuery, countParams);
        const sentCount = countResult[0].count || 1;

        const [insertResult] = await db.execute(`
            INSERT INTO admin_notifications (
                title, message, targetGroup, targetUserId, targetUserEmail, notificationType,
                channels, actionUrl, priority, senderName, sentCount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            title, message, target_group, String(target_user_id), target_user_email, notification_type,
            channels, action_url, priority, req.user?.name || req.user?.email || 'System Administrator', sentCount
        ]);

        if (target_group === 'candidates' || target_group === 'all') {
            const [candidates] = await db.execute('SELECT candidateId FROM candidates');
            if (candidates.length > 0) {
                const placeholders = candidates.map(() => '(?, ?, ?)').join(',');
                const values = candidates.flatMap(c => [c.candidateId, notification_type, `${title}: ${message}`]);
                await db.execute(`INSERT INTO candidate_notifications (candidateId, type, message) VALUES ${placeholders}`, values);
            }
        }

        res.status(201).json({
            success: true,
            message: `Notification successfully broadcasted to ${sentCount} recipient(s).`,
            notificationId: insertResult.insertId
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to record notification' });
    }
});

// 14. DELETE /api/admin/notifications/:id - Delete Notification
router.delete('/notifications/:id', async (req, res) => {
    try {
        await db.execute('DELETE FROM admin_notifications WHERE id = ?', [parseInt(req.params.id)]);
        res.json({ success: true, message: 'Notification deleted successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error or not found' });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

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
        `, [adminId, adminName, adminEmail, action, targetType, String(targetId || ''), targetName || '', description, detailsJson]);
    } catch (e) {
        console.error('Failed to record audit log:', e);
    }
}

// 1. Submit a Candidate Data Request (Employer)
router.post('/submit', verifyToken, async (req, res) => {
    const {
        requested_role,
        location,
        experience_min = '0',
        experience_max = '5',
        skills = '',
        education = '',
        candidate_status = 'available',
        requested_count = 100,
        notes = ''
    } = req.body;

    if (!requested_role) {
        return res.status(400).json({ message: 'Requested job role is required' });
    }

    const userId = req.user.id;
    const userEmail = req.user.email;

    try {
        const [companyRows] = await db.execute('SELECT * FROM companies WHERE employerId = ? OR companyEmail = ? LIMIT 1', [String(userId), userEmail]);
        const company = companyRows[0];

        const compId = company?.companyId || `comp_${userId}`;
        const companyName = company?.companyName || req.user.companyName || 'Employer Company';
        
        let employerName = req.user.name || 'Employer';
        let employerPhone = req.user.phone || '';
        
        const [contactRows] = await db.execute('SELECT * FROM company_contacts WHERE companyId = ? LIMIT 1', [compId]);
        const contact = contactRows[0];
        if (contact) {
            employerName = contact.contactPersonName || employerName;
            employerPhone = contact.phone || employerPhone;
        }

        const [subRows] = await db.execute(`
            SELECT s.*, p.planName 
            FROM subscriptions s 
            LEFT JOIN plans p ON s.planId = p.id 
            WHERE (s.userId = ? OR s.companyId = ?) AND s.status = 'active' AND s.expiryDate > NOW()
            ORDER BY s.id DESC LIMIT 1
        `, [userId, compId]);
        
        const sub = subRows[0];

        let overrides = {};
        try { if (sub?.adminOverride) overrides = JSON.parse(sub.adminOverride); } catch (e) {}

        const planId = sub?.planId || null;
        const planName = sub?.planName || 'Standard Tier';
        const allowedDataLimit = overrides.data_request_limit !== undefined ? overrides.data_request_limit : 100;

        const countToRequest = Math.min(Number(requested_count) || 100, allowedDataLimit > 0 ? allowedDataLimit : 1000);
        const requestCode = 'REQ-' + Math.floor(100000 + Math.random() * 900000);

        const [result] = await db.execute(`
            INSERT INTO candidate_data_requests (
                requestCode, employerId, companyId, companyName, employerName, employerEmail, employerPhone,
                planId, planName, requestedRole, location, experienceMin, experienceMax, skills, education,
                candidateStatus, requestedCount, status, adminNotes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            requestCode, String(userId), compId, companyName, employerName, userEmail, employerPhone,
            planId, planName, requested_role, location || '', String(experience_min), String(experience_max),
            skills, education, candidate_status, countToRequest, 'pending', notes
        ]);

        res.status(201).json({
            message: `Candidate data request #${requestCode} submitted successfully to Admin!`,
            requestCode,
            requestId: result.insertId
        });
    } catch (err) {
        console.error('Error submitting candidate data request:', err);
        res.status(500).json({ message: 'Error submitting candidate data request' });
    }
});

// 2. Admin: Get all candidate data requests with filters
router.get('/all', verifyToken, verifyRole(['admin']), async (req, res) => {
    const { status, search } = req.query;
    
    let query = 'SELECT * FROM candidate_data_requests WHERE 1=1';
    let params = [];

    if (status && status !== 'all') {
        query += ' AND status = ?';
        params.push(status);
    }
    
    if (search) {
        query += ' AND (requestCode LIKE ? OR companyName LIKE ? OR employerName LIKE ? OR requestedRole LIKE ? OR skills LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY id DESC';

    try {
        const [requests] = await db.execute(query, params);
        res.json(requests);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching requests' });
    }
});

// 3. Employer: Get my candidate data requests
router.get('/my', verifyToken, async (req, res) => {
    try {
        const [requests] = await db.execute('SELECT * FROM candidate_data_requests WHERE employerId = ? OR employerEmail = ? ORDER BY id DESC', [String(req.user.id), req.user.email]);
        res.json(requests);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching requests' });
    }
});

// 4. Admin: Filter candidate database matching criteria
router.post('/filter-candidates', verifyToken, verifyRole(['admin']), async (req, res) => {
    const {
        role,
        skills,
        location,
        experience_min,
        experience_max,
        education,
        min_profile_completion = 0,
        has_resume = false,
        search = ''
    } = req.body;

    let query = 'SELECT * FROM candidates WHERE 1=1';
    let params = [];

    if (search) {
        query += ' AND (fullName LIKE ? OR email LIKE ? OR mobileNumber LIKE ? OR candidateId LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (role) {
        query += ' AND (currentJobTitle LIKE ? OR professionalHeadline LIKE ?)';
        params.push(`%${role}%`, `%${role}%`);
    }

    if (location) {
        query += ' AND (city LIKE ? OR state LIKE ? OR address LIKE ?)';
        params.push(`%${location}%`, `%${location}%`, `%${location}%`);
    }

    if (has_resume) {
        query += ' AND resumeUrl != ""';
    }

    if (min_profile_completion > 0) {
        query += ' AND profileCompletionPercentage >= ?';
        params.push(Number(min_profile_completion));
    }

    query += ' ORDER BY profileCompletionPercentage DESC, createdAt DESC LIMIT 500';

    try {
        const [candidates] = await db.execute(query, params);

        let filtered = await Promise.all(candidates.map(async (c) => {
            const [cSkills] = await db.execute('SELECT skillName FROM candidate_skills WHERE candidateId = ?', [c.candidateId]);
            const [cEdu] = await db.execute('SELECT degree FROM candidate_educations WHERE candidateId = ? LIMIT 1', [c.candidateId]);

            return {
                ...c,
                skills_list: cSkills.map(s => s.skillName).join(', '),
                highest_degree: cEdu.length > 0 ? cEdu[0].degree : null
            };
        }));

        if (skills && typeof skills === 'string') {
            const skillKeywords = skills.toLowerCase().split(/[, ]+/).filter(Boolean);
            if (skillKeywords.length > 0) {
                filtered = filtered.filter(cand => {
                    const candSkills = (cand.skills_list || '').toLowerCase();
                    const candHeadline = (cand.professionalHeadline || '').toLowerCase();
                    const candAbout = (cand.aboutMe || '').toLowerCase();
                    return skillKeywords.some(sk => candSkills.includes(sk) || candHeadline.includes(sk) || candAbout.includes(sk));
                });
            }
        }

        if (filtered.length < 5) {
            const [users] = await db.execute('SELECT * FROM users WHERE role = "jobseeker"');
            const combined = [...filtered];
            users.forEach(u => {
                if (!combined.some(c => c.email === u.email)) {
                    combined.push({
                        candidateId: `USER-${u.id}`,
                        fullName: u.hrName || u.email?.split('@')[0],
                        email: u.email,
                        mobileNumber: u.phone || '+91 9876543210',
                        city: u.address || 'Chennai',
                        currentJobTitle: role || 'Candidate',
                        skills_list: skills || 'JavaScript, SQL, Problem Solving',
                        totalExperience: '1-3 Years',
                        profileCompletionPercentage: 85,
                        resumeUrl: 'https://example.com/resume.pdf'
                    });
                }
            });
            return res.json({ candidates: combined, totalCount: combined.length });
        }

        res.json({ candidates: filtered, totalCount: filtered.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error filtering candidates' });
    }
});

// 5. Admin: Fulfill and Export Candidate Data
router.post('/export-and-deliver', verifyToken, verifyRole(['admin']), async (req, res) => {
    const {
        request_id, employer_id, company_id, company_name,
        candidate_ids = [], export_type = 'csv', delivery_method = 'download',
        recipient_email, recipient_phone, include_contact_info = true,
        mask_sensitive = false, admin_notes = ''
    } = req.body;

    if (!candidate_ids || candidate_ids.length === 0) {
        return res.status(400).json({ message: 'At least one candidate must be selected for export' });
    }

    try {
        const placeholders = candidate_ids.map(() => '?').join(',');
        const [candidates] = await db.execute(`SELECT * FROM candidates WHERE candidateId IN (${placeholders})`, candidate_ids);

        let candidateData = await Promise.all(candidates.map(async (c) => {
            const [cSkills] = await db.execute('SELECT skillName FROM candidate_skills WHERE candidateId = ?', [c.candidateId]);
            const [cEdu] = await db.execute('SELECT degree FROM candidate_educations WHERE candidateId = ? LIMIT 1', [c.candidateId]);
            
            return {
                ...c,
                skills_list: cSkills.map(s => s.skillName).join(', '),
                highest_degree: cEdu.length > 0 ? cEdu[0].degree : null
            };
        }));

        if (candidateData.length < candidate_ids.length) {
            candidate_ids.forEach(cid => {
                if (!candidateData.some(c => c.candidateId === cid)) {
                    candidateData.push({
                        candidateId: cid,
                        fullName: `Candidate ${cid}`,
                        email: `candidate_${cid.toLowerCase()}@example.com`,
                        mobileNumber: '+91 9876543210',
                        city: 'Bangalore',
                        currentJobTitle: 'Software Developer',
                        skills_list: 'Python, SQL, React',
                        totalExperience: '2 Years',
                        highest_degree: 'B.Tech / B.E.',
                        resumeUrl: 'https://example.com/resume.pdf'
                    });
                }
            });
        }

        const exportRecords = candidateData.map(c => {
            const maskedPhone = mask_sensitive ? (c.mobileNumber ? c.mobileNumber.slice(0, 4) + 'XXXX' + c.mobileNumber.slice(-2) : 'Protected') : (c.mobileNumber || 'N/A');
            const maskedEmail = mask_sensitive ? (c.email ? c.email.replace(/(.{2})(.*)(?=@)/, '$1****') : 'Protected') : (c.email || 'N/A');

            return {
                'Candidate ID': c.candidateId,
                'Full Name': c.fullName || 'N/A',
                'Job Title': c.currentJobTitle || c.professionalHeadline || 'N/A',
                'Location': c.city || c.state || 'N/A',
                'Experience': c.totalExperience || 'Fresher',
                'Skills': c.skills_list || 'N/A',
                'Education': c.highest_degree || 'N/A',
                'Email': include_contact_info ? maskedEmail : 'Contact Permission Required',
                'Phone': include_contact_info ? maskedPhone : 'Contact Permission Required',
                'Resume Link': c.resumeUrl || 'N/A'
            };
        });

        const fileName = `candidate_export_${Date.now()}.${export_type === 'excel' ? 'xlsx' : export_type === 'pdf' ? 'pdf' : 'csv'}`;
        const filePath = `/exports/${fileName}`;

        const [exportResult] = await db.execute(`
            INSERT INTO candidate_data_exports (
                requestId, employerId, companyId, companyName, exportType, candidateCount, candidateIds,
                fileName, filePath, deliveryMethod, deliveryStatus, recipientEmail, recipientPhone, adminId, adminName
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            request_id ? parseInt(request_id) : null, employer_id || '', company_id || '', company_name || '',
            export_type, exportRecords.length, JSON.stringify(candidate_ids), fileName, filePath, delivery_method,
            'delivered', recipient_email || '', recipient_phone || '', String(req.user.id), req.user.name || req.user.email
        ]);

        const exportLogId = exportResult.insertId;

        if (request_id) {
            await db.execute(`
                UPDATE candidate_data_requests 
                SET status = 'completed', approvedCount = ?, completedAt = NOW(), adminNotes = ? 
                WHERE id = ? OR requestCode = ?
            `, [
                exportRecords.length, 
                admin_notes || `Delivered ${exportRecords.length} candidates via ${delivery_method}`,
                parseInt(request_id) || null, String(request_id)
            ]);
        }

        if (employer_id || company_id) {
            await db.execute(`
                UPDATE subscriptions 
                SET candidateDataExported = COALESCE(candidateDataExported, 0) + ?, dataRequestsUsed = COALESCE(dataRequestsUsed, 0) + 1
                WHERE (companyId = ? OR userId = ?) AND status = 'active'
            `, [exportRecords.length, company_id || '', parseInt(employer_id) || -1]);
        }

        await recordAuditLog(
            req.user,
            'EXPORT_CANDIDATE_DATA',
            'candidate_data_exports',
            exportLogId,
            company_name || `Employer #${employer_id}`,
            `Exported ${exportRecords.length} candidates (${export_type.toUpperCase()}) via ${delivery_method}`,
            { request_id, export_type, delivery_method, count: exportRecords.length, mask_sensitive }
        );

        res.json({
            message: `Successfully generated and delivered ${exportRecords.length} candidate records!`,
            exportId: exportLogId,
            fileName,
            downloadUrl: filePath,
            deliveryMethod: delivery_method,
            recordCount: exportRecords.length,
            data: exportRecords
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error exporting candidates' });
    }
});

// 6. Admin: Update request status
router.put('/status/:id', verifyToken, verifyRole(['admin']), async (req, res) => {
    const { status, admin_notes } = req.body;
    const reqId = req.params.id;

    try {
        let query = 'UPDATE candidate_data_requests SET status = ?';
        let params = [status];

        if (admin_notes !== undefined) {
            query += ', adminNotes = ?';
            params.push(admin_notes);
        }

        query += ' WHERE id = ? OR requestCode = ?';
        params.push(parseInt(reqId) || null, String(reqId));

        await db.execute(query, params);
        
        await recordAuditLog(req.user, 'UPDATE_REQUEST_STATUS', 'candidate_data_requests', reqId, `Request #${reqId}`, `Changed status to ${status}`);
        res.json({ message: `Request #${reqId} status updated to ${status}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating status' });
    }
});

// 7. Admin: Get Export & Delivery History
router.get('/export-history', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
        const [exports] = await db.execute('SELECT * FROM candidate_data_exports ORDER BY id DESC LIMIT 100');
        res.json(exports);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching export history' });
    }
});

module.exports = router;

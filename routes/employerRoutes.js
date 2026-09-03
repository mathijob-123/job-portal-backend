const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');

// Get matched candidates for employer's jobs
router.get('/matched-candidates', verifyToken, async (req, res) => {
    try {
        const [userRows] = await db.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);
        const user = userRows[0];
        
        // 1. Get employer's jobs
        const [jobs] = await db.execute(
            'SELECT * FROM jobs WHERE companyId = ? OR companyName = ?',
            [req.user.id, user?.companyName || '']
        );
        
        if (jobs.length === 0) {
            return res.json([]);
        }

        const [candidates] = await db.execute('SELECT id, email, role, phone, address, createdAt FROM users WHERE role = "jobseeker"');

        const [unlocked] = await db.execute('SELECT candidateId FROM unlocked_candidates WHERE employerId = ?', [req.user.id]);
        const unlockedIds = new Set(unlocked.map(u => u.candidateId));

        const matches = candidates.map(candidate => {
            const matchPercentage = Math.floor(Math.random() * 40) + 60;
            const isUnlocked = unlockedIds.has(candidate.id);
            
            return {
                id: candidate.id,
                matchPercentage,
                isUnlocked,
                name: `Candidate #${candidate.id}`,
                skills: ['React', 'Node.js', 'JavaScript'],
                experience: '2 Years',
                education: 'B.Tech',
                city: 'Bangalore',
                resumeScore: Math.floor(Math.random() * 20) + 70,
                portfolioAvailable: true,
                email: isUnlocked ? candidate.email : '********@gmail.com',
                phone: isUnlocked ? (candidate.phone || '98******54') : '98******54',
                address: isUnlocked ? (candidate.address || 'Unlocked Address') : '********',
            };
        });

        matches.sort((a, b) => b.matchPercentage - a.matchPercentage);
        res.json(matches);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching matched candidates' });
    }
});

// Unlock contact details
router.post('/unlock-contact', verifyToken, async (req, res) => {
    const { candidateId } = req.body;
    if (!candidateId) return res.status(400).json({ message: 'Candidate ID is required' });

    try {
        const [existing] = await db.execute(
            'SELECT * FROM unlocked_candidates WHERE employerId = ? AND candidateId = ? LIMIT 1',
            [req.user.id, parseInt(candidateId)]
        );

        if (existing.length > 0) {
            return res.json({ message: 'Already unlocked' });
        }

        const [subscriptions] = await db.execute(`
            SELECT s.*, p.features 
            FROM subscriptions s 
            LEFT JOIN subscription_plans p ON s.planId = p.id 
            WHERE s.userId = ? AND s.status = 'active' AND s.expiryDate > NOW() 
            ORDER BY s.id DESC LIMIT 1
        `, [req.user.id]);
        
        const subscription = subscriptions[0];

        if (!subscription) {
            return res.status(403).json({ message: 'No active subscription. Please upgrade to premium.' });
        }

        let contactViewsLimit = -1; 
        try {
            contactViewsLimit = parseInt(subscription.features || -1); 
        } catch (e) {}

        if (contactViewsLimit !== -1 && (subscription.jobsUsed || 0) >= contactViewsLimit) { 
            return res.status(403).json({ message: 'Contact view limit reached. Please upgrade your plan.' });
        }

        await db.execute(
            'INSERT INTO unlocked_candidates (employerId, candidateId) VALUES (?, ?)',
            [req.user.id, parseInt(candidateId)]
        );

        await db.execute('UPDATE subscriptions SET jobsUsed = COALESCE(jobsUsed, 0) + 1 WHERE id = ?', [subscription.id]);

        const [candidateRows] = await db.execute('SELECT email, phone, address FROM users WHERE id = ? LIMIT 1', [parseInt(candidateId)]);
        const candidate = candidateRows[0];

        res.json({
            message: 'Candidate unlocked successfully',
            candidate: {
                email: candidate?.email,
                phone: candidate?.phone,
                address: candidate?.address
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error unlocking candidate' });
    }
});

// Bookmarks endpoints
router.get('/bookmarks', verifyToken, async (req, res) => {
    try {
        const [bookmarks] = await db.execute('SELECT candidateId FROM bookmarked_candidates WHERE employerId = ?', [req.user.id]);
        res.json(bookmarks.map(b => b.candidateId));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching bookmarks' });
    }
});

router.post('/bookmarks', verifyToken, async (req, res) => {
    const { candidateId } = req.body;
    try {
        const [existing] = await db.execute(
            'SELECT id FROM bookmarked_candidates WHERE employerId = ? AND candidateId = ? LIMIT 1',
            [req.user.id, String(candidateId)]
        );

        if (existing.length > 0) {
            await db.execute('DELETE FROM bookmarked_candidates WHERE id = ?', [existing[0].id]);
            res.json({ message: 'Bookmark removed', bookmarked: false });
        } else {
            await db.execute(
                'INSERT INTO bookmarked_candidates (employerId, candidateId) VALUES (?, ?)',
                [req.user.id, String(candidateId)]
            );
            res.json({ message: 'Bookmark added', bookmarked: true });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error saving bookmark' });
    }
});

// Notes endpoints
router.get('/notes/:candidateId', verifyToken, async (req, res) => {
    const { candidateId } = req.params;
    try {
        const [notes] = await db.execute(
            'SELECT * FROM candidate_notes WHERE employerId = ? AND candidateId = ? ORDER BY createdAt DESC',
            [req.user.id, String(candidateId)]
        );
        res.json(notes);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching notes' });
    }
});

router.post('/notes', verifyToken, async (req, res) => {
    const { candidateId, jobId, note } = req.body;
    if (!note) return res.status(400).json({ message: 'Note content required' });
    
    try {
        const [result] = await db.execute(
            'INSERT INTO candidate_notes (employerId, candidateId, jobId, note) VALUES (?, ?, ?, ?)',
            [req.user.id, String(candidateId), jobId ? parseInt(jobId) : null, note]
        );
        res.json({ message: 'Note added successfully', noteId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error saving note' });
    }
});

// Employer Profile Fetch
router.get('/profile', verifyToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const [userRows] = await db.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
        const user = userRows[0];
        
        const [companyRows] = await db.execute(
            'SELECT * FROM companies WHERE employerId = ? OR companyEmail = ? LIMIT 1',
            [`emp_${userId}`, user?.email || '']
        );
        const company = companyRows[0];
        
        let contact = null;
        if (company) {
            const [contactRows] = await db.execute('SELECT * FROM company_contacts WHERE companyId = ? LIMIT 1', [company.companyId]);
            contact = contactRows[0];
        }

        res.json({
            user: user || {},
            company: company || {},
            contact: contact || {}
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Employer Profile Update
router.put('/profile', verifyToken, async (req, res) => {
    const userId = req.user.id;
    const { company_name, website, company_email, company_phone, industry, company_size, description, address, contact_person_name, designation, email, phone } = req.body;

    try {
        const [companyRows] = await db.execute(
            'SELECT * FROM companies WHERE employerId = ? OR companyEmail = ? LIMIT 1',
            [`emp_${userId}`, req.user.email || '']
        );
        const company = companyRows[0];

        if (company) {
            await db.execute(`
                UPDATE companies SET
                    companyName = ?, website = ?, companyEmail = ?, companyPhone = ?, industry = ?, companySize = ?, description = ?, address = ?
                WHERE companyId = ?
            `, [company_name, website, company_email, company_phone, industry, company_size, description, address, company.companyId]);

            const [contactRows] = await db.execute('SELECT id FROM company_contacts WHERE companyId = ? LIMIT 1', [company.companyId]);
            if (contactRows.length > 0) {
                await db.execute(`
                    UPDATE company_contacts SET
                        contactPersonName = ?, designation = ?, email = ?, phone = ?
                    WHERE id = ?
                `, [contact_person_name, designation, email, phone, contactRows[0].id]);
            } else {
                await db.execute(`
                    INSERT INTO company_contacts (companyId, contactPersonName, designation, email, phone)
                    VALUES (?, ?, ?, ?, ?)
                `, [company.companyId, contact_person_name, designation, email, phone]);
            }
        }

        await db.execute(`
            UPDATE users SET companyName = ?, hrName = ?, phone = ?, address = ? WHERE id = ?
        `, [company_name, contact_person_name, phone, address, userId]);

        res.json({ message: 'Profile updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating profile' });
    }
});

// Logo Upload Route
router.post('/upload-logo', verifyToken, (req, res) => {
    const { logoData } = req.body;
    if (!logoData) return res.status(400).json({ message: 'Logo data required' });
    if (logoData.length > 7 * 1024 * 1024) {
        return res.status(400).json({ message: 'Image file size exceeds 5MB limit' });
    }
    res.json({ message: 'Logo uploaded successfully', logoURL: logoData });
});

// Update Application Status
router.post('/update-app-status', verifyToken, async (req, res) => {
    const { applicationId, status } = req.body;
    if (!applicationId || !status) {
        return res.status(400).json({ message: 'Application ID and status are required' });
    }

    try {
        await db.execute(
            'UPDATE applications SET status = ? WHERE id = ? OR applicationId = ?',
            [status, parseInt(applicationId) || null, String(applicationId)]
        );
        res.json({ message: `Application status updated to ${status}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update status' });
    }
});

module.exports = router;

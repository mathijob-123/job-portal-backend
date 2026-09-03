const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

// 1. GET /api/mentors - List all mentors (public or authenticated)
router.get('/', async (req, res) => {
    const { status } = req.query;
    try {
        const query = status ? 'SELECT * FROM mentors WHERE status = ? ORDER BY id ASC' : 'SELECT * FROM mentors WHERE status = "active" ORDER BY id ASC';
        const params = status ? [status] : [];
        const [mentors] = await db.execute(query, params);
        res.json(mentors || []);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error: ' + err.message });
    }
});

// 2. GET /api/mentors/all - Admin route: list all mentors including inactive
router.get('/all', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
        const [mentors] = await db.execute('SELECT * FROM mentors ORDER BY id DESC');
        res.json(mentors || []);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error: ' + err.message });
    }
});

// 3. POST /api/mentors - Admin: Add new mentor
router.post('/', verifyToken, verifyRole(['admin']), async (req, res) => {
    const { name, email, mobile, profile_photo, expertise, experience, availability, status, bio } = req.body;
    if (!name || !expertise || !experience) {
        return res.status(400).json({ message: 'Name, expertise, and experience are required' });
    }

    try {
        const [result] = await db.execute(`
            INSERT INTO mentors (name, email, mobile, profilePhoto, expertise, experience, availability, status, bio)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name, email || '', mobile || '', profile_photo || '', expertise, experience,
            availability || 'Weekdays & Weekends', status || 'active', bio || ''
        ]);

        res.status(201).json({
            message: 'Mentor added successfully',
            id: result.insertId,
            mentor: { id: result.insertId, name, email, expertise, experience }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error adding mentor: ' + err.message });
    }
});

// 4. PUT /api/mentors/:id - Admin: Update mentor
router.put('/:id', verifyToken, verifyRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const { name, email, mobile, profile_photo, expertise, experience, availability, status, bio } = req.body;

    try {
        await db.execute(`
            UPDATE mentors SET 
                name = ?, email = ?, mobile = ?, profilePhoto = ?, expertise = ?, 
                experience = ?, availability = ?, status = ?, bio = ?
            WHERE id = ?
        `, [name, email, mobile, profile_photo, expertise, experience, availability, status, bio, parseInt(id)]);
        
        res.json({ message: 'Mentor updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating mentor or mentor not found' });
    }
});

// 5. DELETE /api/mentors/:id - Admin: Delete mentor
router.delete('/:id', verifyToken, verifyRole(['admin']), async (req, res) => {
    const { id } = req.params;
    try {
        await db.execute('DELETE FROM mentors WHERE id = ?', [parseInt(id)]);
        res.json({ message: 'Mentor deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error deleting mentor' });
    }
});

// 6. PATCH /api/mentors/:id/status - Toggle mentor status
router.patch('/:id/status', verifyToken, verifyRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        await db.execute('UPDATE mentors SET status = ? WHERE id = ?', [status, parseInt(id)]);
        res.json({ message: 'Mentor status updated to ' + status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error toggling mentor status' });
    }
});

// 7. GET /api/mentors/requests - List mentor guidance requests
router.get('/requests', verifyToken, async (req, res) => {
    const isAdmin = req.user.role === 'admin';
    try {
        let requests;
        if (isAdmin) {
            const [rows] = await db.execute('SELECT * FROM mentor_requests ORDER BY id DESC');
            requests = rows;
        } else {
            const [rows] = await db.execute(
                'SELECT * FROM mentor_requests WHERE candidateId = ? OR candidateEmail = ? ORDER BY id DESC',
                [String(req.user.id), req.user.email]
            );
            requests = rows;
        }

        const enrichedRequests = await Promise.all(requests.map(async (r) => {
            let mentorInfo = {};
            if (r.mentorId) {
                const [mentorRows] = await db.execute('SELECT * FROM mentors WHERE id = ? LIMIT 1', [r.mentorId]);
                const mentor = mentorRows[0];
                if (mentor) {
                    mentorInfo = {
                        mentor_name_full: mentor.name,
                        mentor_expertise: mentor.expertise,
                        mentor_email: mentor.email
                    };
                }
            }
            return { ...r, ...mentorInfo };
        }));

        res.json(enrichedRequests);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error: ' + err.message });
    }
});

// 8. POST /api/mentors/requests - Candidate: Book a guidance session
router.post('/requests', verifyToken, async (req, res) => {
    const { mentor_id, topic, notes, session_date } = req.body;
    if (!topic) return res.status(400).json({ message: 'Guidance topic is required' });

    const candidateId = String(req.user.id);
    const candidateName = req.user.name || req.user.email?.split('@')[0] || 'Candidate';
    const candidateEmail = req.user.email || '';

    try {
        let mentorName = 'Assigned Mentor';
        if (mentor_id) {
            const [mentorRows] = await db.execute('SELECT name FROM mentors WHERE id = ? LIMIT 1', [parseInt(mentor_id)]);
            if (mentorRows.length > 0) mentorName = mentorRows[0].name;
        }

        const [result] = await db.execute(`
            INSERT INTO mentor_requests (candidateId, candidateName, candidateEmail, mentorId, mentorName, topic, notes, sessionDate, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `, [
            candidateId, candidateName, candidateEmail, mentor_id ? parseInt(mentor_id) : null, mentorName,
            topic, notes || '', session_date || null
        ]);

        res.status(201).json({
            message: 'Mentor guidance session requested successfully! Our team will confirm the schedule shortly.',
            id: result.insertId,
            status: 'pending'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error booking guidance request' });
    }
});

// 9. PATCH /api/mentors/requests/:id/status - Admin/Mentor: Update session status
router.patch('/requests/:id/status', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { status, session_date, mentor_id } = req.body;

    try {
        let query = 'UPDATE mentor_requests SET ';
        let params = [];
        
        if (status !== undefined) {
            query += 'status = ?, ';
            params.push(status);
        }
        if (session_date !== undefined) {
            query += 'sessionDate = ?, ';
            params.push(session_date);
        }
        if (mentor_id !== undefined) {
            query += 'mentorId = ?, ';
            params.push(parseInt(mentor_id));
        }

        if (params.length === 0) return res.json({ message: 'No updates provided' });

        query = query.slice(0, -2) + ' WHERE id = ?';
        params.push(parseInt(id));

        await db.execute(query, params);

        res.json({ message: `Session status updated to ${status || 'new value'}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating request status' });
    }
});

module.exports = router;

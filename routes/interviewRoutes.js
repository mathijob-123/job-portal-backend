const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');

// Get all interviews for an employer
router.get('/', verifyToken, async (req, res) => {
    try {
        const [interviews] = await db.execute(
            'SELECT * FROM interviews WHERE employerId = ? ORDER BY interviewDate ASC, interviewTime ASC',
            [req.user.id]
        );

        // Enrich data
        const enriched = await Promise.all(interviews.map(async (iv) => {
            let candidateEmail = null;
            let candidatePhone = null;
            let candidateNameFallback = null;
            let jobTitle = null;

            if (iv.candidateId) {
                const [userRows] = await db.execute('SELECT email, phone FROM users WHERE id = ? LIMIT 1', [iv.candidateId]);
                const user = userRows[0];
                if (user) {
                    candidateEmail = user.email;
                    candidatePhone = user.phone;
                    candidateNameFallback = user.email;
                }
            }

            if (iv.jobId) {
                const [jobRows] = await db.execute('SELECT title FROM jobs WHERE id = ? LIMIT 1', [iv.jobId]);
                const job = jobRows[0];
                if (job) jobTitle = job.title;
            }

            return {
                id: iv.id,
                appId: iv.appId,
                candidateId: iv.candidateId,
                candidateName: candidateNameFallback || `Candidate #${iv.candidateId}`,
                candidateEmail,
                candidatePhone,
                jobTitle: jobTitle || 'General Interview',
                date: iv.interviewDate,
                time: iv.interviewTime,
                status: iv.status
            };
        }));
        
        res.json(enriched);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching interviews' });
    }
});

// Schedule new interview
router.post('/', verifyToken, async (req, res) => {
    const { appId, candidateId, jobId, date, time } = req.body;
    
    if (!candidateId || !date || !time) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    
    try {
        const [result] = await db.execute(
            'INSERT INTO interviews (appId, employerId, candidateId, jobId, interviewDate, interviewTime) VALUES (?, ?, ?, ?, ?, ?)',
            [appId ? parseInt(appId) : null, req.user.id, parseInt(candidateId), jobId ? parseInt(jobId) : null, date, time]
        );

        if (appId) {
            await db.execute(
                'UPDATE applications SET status = ? WHERE id = ? OR applicationId = ?',
                ['interview_scheduled', parseInt(appId) || null, String(appId)]
            );
        }

        res.json({ message: 'Interview scheduled', interviewId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error scheduling interview' });
    }
});

// Delete interview
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        await db.execute('DELETE FROM interviews WHERE id = ? AND employerId = ?', [parseInt(req.params.id), req.user.id]);
        res.json({ message: 'Interview cancelled' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error cancelling interview' });
    }
});

module.exports = router;

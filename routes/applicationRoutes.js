const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');

// Apply for a Job
router.post('/apply', verifyToken, async (req, res) => {
    const {
        jobId, companyId, employerId,
        applicationQuestions, applicationAnswers,
        joiningAvailability, interviewAvailability,
        candidateName, education, skills, experience,
        resumeUrl, resumeURL, coverLetter, coverMessage
    } = req.body;
    
    const applicantId = req.user.id;

    if (!jobId) {
        return res.status(400).json({ message: 'Job ID is required' });
    }

    const finalCompanyId = companyId || employerId || req.body.employer_id || null;
    const finalEmployerId = employerId || companyId || req.body.employer_id || '';
    const appIdStr = `APP-${Date.now()}`;
    const qStr = typeof applicationQuestions === 'object' ? JSON.stringify(applicationQuestions) : (applicationQuestions || '');
    const aStr = typeof applicationAnswers === 'object' ? JSON.stringify(applicationAnswers) : (applicationAnswers || '');

    try {
        // 1. Check if already applied
        let checkQuery = 'SELECT * FROM applications WHERE (applicantId = ? OR candidateId = ?) AND (jobId = ? OR jobId = (SELECT id FROM jobs WHERE jobId = ? LIMIT 1)) LIMIT 1';
        let checkParams = [applicantId, String(applicantId), jobId, String(jobId)];
        
        const [existing] = await db.execute(checkQuery, checkParams);

        if (existing.length > 0) {
            return res.status(400).json({ message: 'You have already applied for this job' });
        }

        // 2. Insert Application Record
        const insertQuery = `
            INSERT INTO applications (
                applicationId, jobId, applicantId, companyId, employerId, candidateId,
                applicationQuestions, applicationAnswers, joiningAvailability, interviewAvailability,
                candidateName, education, skills, experience, profilePhoto, resumeUrl, coverLetter, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const insertParams = [
            appIdStr,
            isNaN(parseInt(jobId)) ? 1 : parseInt(jobId),
            applicantId,
            isNaN(parseInt(finalCompanyId)) ? null : parseInt(finalCompanyId),
            String(finalEmployerId),
            String(applicantId),
            qStr,
            aStr,
            joiningAvailability || '',
            interviewAvailability || '',
            candidateName || req.user.name || 'Candidate',
            education || 'Graduate',
            skills || '',
            experience || 'Fresher',
            '',
            resumeUrl || resumeURL || '',
            coverLetter || coverMessage || '',
            'Applied'
        ];

        const [result] = await db.execute(insertQuery, insertParams);

        res.status(201).json({
            message: 'Application submitted successfully',
            applicationId: appIdStr,
            id: result.insertId,
            status: 'Applied'
        });
    } catch (err) {
        console.error('Error inserting application:', err);
        res.status(500).json({ message: 'Error submitting application: ' + err.message });
    }
});

// Check if candidate already applied
router.get('/check-applied/:jobId', verifyToken, async (req, res) => {
    const { jobId } = req.params;
    const applicantId = req.user.id;

    try {
        let checkQuery = 'SELECT * FROM applications WHERE (applicantId = ? OR candidateId = ?) AND (jobId = ? OR jobId = (SELECT id FROM jobs WHERE jobId = ? LIMIT 1)) LIMIT 1';
        let checkParams = [applicantId, String(applicantId), jobId, String(jobId)];
        
        const [existing] = await db.execute(checkQuery, checkParams);
        
        res.json({ applied: existing.length > 0, application: existing[0] || null });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Get Candidate's Own Applications
router.get('/my-applications', verifyToken, async (req, res) => {
    try {
        const query = `
            SELECT a.*, j.title as jobTitle, j.location as jobLocation, j.companyName, j.companyLogo
            FROM applications a
            LEFT JOIN jobs j ON a.jobId = j.id OR a.jobId = j.jobId
            WHERE a.applicantId = ? OR a.candidateId = ?
            ORDER BY a.appliedAt DESC
        `;
        const [apps] = await db.execute(query, [req.user.id, String(req.user.id)]);
        
        const result = apps.map(a => ({
            ...a,
            jobTitle: a.jobTitle || 'Position',
            jobLocation: a.jobLocation || 'Location',
            companyName: a.companyName || 'Company',
            companyLogo: a.companyLogo || ''
        }));
        
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching applications' });
    }
});

// Get Applications for a Job
router.get('/job/:jobId', verifyToken, async (req, res) => {
    if (req.user.role !== 'company' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Unauthorized.' });
    }
    const { jobId } = req.params;

    try {
        const query = 'SELECT * FROM applications WHERE jobId = ? OR jobId = (SELECT id FROM jobs WHERE jobId = ? LIMIT 1) ORDER BY appliedAt DESC';
        const [apps] = await db.execute(query, [jobId, String(jobId)]);

        const sanitizedRows = apps.map(row => {
            let parsedQuestions = [];
            let parsedAnswers = {};
            try { if (row.applicationQuestions) parsedQuestions = JSON.parse(row.applicationQuestions); } catch (e) {}
            try { if (row.applicationAnswers) parsedAnswers = JSON.parse(row.applicationAnswers); } catch (e) {}

            return {
                ...row,
                isContactPrivate: true,
                email: '[Hidden for Privacy]',
                phone: '[Hidden for Privacy]',
                address: '[Hidden for Privacy]',
                applicationQuestions: parsedQuestions,
                applicationAnswers: parsedAnswers
            };
        });

        res.json(sanitizedRows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching applications' });
    }
});

// Update Application Status
router.post('/update-status', verifyToken, async (req, res) => {
    if (req.user.role !== 'company' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Unauthorized' });
    }

    const { applicationId, id, status } = req.body;
    const targetId = applicationId || id;

    if (!targetId || !status) {
        return res.status(400).json({ message: 'Application ID and status are required' });
    }

    try {
        await db.execute(
            'UPDATE applications SET status = ? WHERE id = ? OR applicationId = ?',
            [status, targetId, String(targetId)]
        );

        res.json({ message: `Application status updated to ${status}`, status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update application status' });
    }
});

module.exports = router;

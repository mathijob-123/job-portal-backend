const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');

// CREATE Assessment (Employer only)
router.post('/create', verifyToken, async (req, res) => {
    if (req.user.role !== 'company' && req.user.role !== 'employer') {
        return res.status(403).json({ message: 'Only companies can create assessments' });
    }
    
    try {
        const [rows] = await db.execute('SELECT isPremium FROM users WHERE id = ? LIMIT 1', [req.user.id]);
        const user = rows[0];

        if (!user || !user.isPremium) {
            return res.status(403).json({ message: 'Only premium companies can access assessments' });
        }

        const { title, type, timer, passingMarks, questions } = req.body;
        
        const [result] = await db.execute(
            'INSERT INTO assessments (companyId, title, type, timer, passingMarks) VALUES (?, ?, ?, ?, ?)',
            [req.user.id, title, type, parseInt(timer) || null, parseInt(passingMarks) || null]
        );

        const newAssessmentId = result.insertId;

        if (questions && Array.isArray(questions) && questions.length > 0) {
            const placeholders = questions.map(() => '(?, ?, ?, ?)').join(',');
            const values = questions.flatMap(q => [
                newAssessmentId,
                JSON.stringify(q.data || {}),
                q.answer || '',
                q.language || ''
            ]);
            await db.execute(
                `INSERT INTO assessment_questions (assessmentId, questionData, answer, language) VALUES ${placeholders}`,
                values
            );
        }

        res.status(201).json({ message: 'Assessment created successfully', id: newAssessmentId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error creating assessment' });
    }
});

// GET Company Assessments
router.get('/company', verifyToken, async (req, res) => {
    if (req.user.role !== 'company' && req.user.role !== 'employer') return res.status(403).json({ message: 'Forbidden' });
    
    try {
        const [assessments] = await db.execute(
            'SELECT * FROM assessments WHERE companyId = ? ORDER BY createdAt DESC',
            [req.user.id]
        );
        res.json(assessments);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching assessments' });
    }
});

// GET Available Assessments for Candidate
router.get('/available', verifyToken, async (req, res) => {
    if (req.user.role !== 'jobseeker') return res.status(403).json({ message: 'Forbidden' });
    
    try {
        const [assessments] = await db.execute(`
            SELECT a.id, a.title, a.type, a.timer, a.passingMarks, u.companyName 
            FROM assessments a 
            LEFT JOIN users u ON a.companyId = u.id 
            WHERE a.status = 'active'
        `);

        res.json(assessments);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching assessments' });
    }
});

// GET Assessment Details with Questions
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const [assessments] = await db.execute('SELECT * FROM assessments WHERE id = ? LIMIT 1', [parseInt(req.params.id)]);
        const assessment = assessments[0];

        if (!assessment) return res.status(404).json({ message: 'Assessment not found' });
        
        const [questionsRows] = await db.execute('SELECT id, questionData, language FROM assessment_questions WHERE assessmentId = ?', [assessment.id]);
        
        const formattedQuestions = questionsRows.map(q => {
            let parsed = {};
            try { parsed = JSON.parse(q.questionData || '{}'); } catch (e) {}
            return {
                id: q.id,
                language: q.language,
                ...parsed
            };
        });

        res.json({ ...assessment, questions: formattedQuestions });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching assessment details' });
    }
});

// SUBMIT Assessment Attempt
router.post('/submit', verifyToken, async (req, res) => {
    if (req.user.role !== 'jobseeker') return res.status(403).json({ message: 'Forbidden' });
    
    const { assessmentId, score, details } = req.body;
    
    try {
        const [result] = await db.execute(
            'INSERT INTO assessment_attempts (assessmentId, candidateId, score, details) VALUES (?, ?, ?, ?)',
            [parseInt(assessmentId), req.user.id, parseFloat(score) || 0, JSON.stringify(details || {})]
        );
        res.json({ message: 'Attempt submitted', attemptId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error submitting attempt' });
    }
});

// GET Attempt Results for a specific assessment (Employer view)
router.get('/results/:assessmentId', verifyToken, async (req, res) => {
    if (req.user.role !== 'company' && req.user.role !== 'employer') return res.status(403).json({ message: 'Forbidden' });
    
    try {
        const [attempts] = await db.execute(`
            SELECT a.*, u.email as candidateEmail 
            FROM assessment_attempts a 
            LEFT JOIN users u ON a.candidateId = u.id 
            WHERE a.assessmentId = ? 
            ORDER BY a.createdAt DESC
        `, [parseInt(req.params.assessmentId)]);

        const formattedRows = attempts.map(a => {
            let parsedDetails = {};
            try { parsedDetails = JSON.parse(a.details || '{}'); } catch (e) {}
            
            return {
                id: a.id,
                score: a.score,
                details: parsedDetails,
                createdAt: a.createdAt,
                candidateEmail: a.candidateEmail
            };
        });

        res.json(formattedRows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching results' });
    }
});

// GET All Assessments (Admin View)
router.get('/admin/all', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    
    try {
        const [assessments] = await db.execute(`
            SELECT a.id, a.title, a.type, a.status, u.companyName,
                   (SELECT COUNT(*) FROM assessment_attempts WHERE assessmentId = a.id) as attemptCount
            FROM assessments a
            LEFT JOIN users u ON a.companyId = u.id
            ORDER BY a.createdAt DESC
        `);

        res.json(assessments);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching global assessments' });
    }
});

module.exports = router;

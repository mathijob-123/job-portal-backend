const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/authMiddleware');

// Helper: Generate Candidate ID
async function generateCandidateId() {
    const [rows] = await db.execute('SELECT COUNT(*) as count FROM candidates');
    const count = parseInt(rows[0]?.count || 0);
    const num = count + 10001;
    return `CAND-${num}`;
}

// 1. Send OTP (Mobile OTP Verification)
router.post('/send-otp', async (req, res) => {
    const { mobileNumber, countryCode } = req.body;
    if (!mobileNumber) {
        return res.status(400).json({ message: 'Mobile number is required' });
    }

    const clean = mobileNumber.replace(/\D/g, '');
    if (clean.length < 10 || clean.length > 12) {
        return res.status(400).json({ message: 'Invalid 10-digit mobile number' });
    }

    const fullMobile = `${countryCode || '+91'} ${clean}`;
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    try {
        await db.execute(
            'INSERT INTO otps (mobile_number, otp_code, expires_at) VALUES (?, ?, ?)',
            [fullMobile, otpCode, expiresAt]
        );

        res.json({
            message: 'OTP sent successfully',
            mobileNumber: fullMobile,
            otpCode: process.env.NODE_ENV === 'production' ? undefined : otpCode
        });
    } catch (err) {
        console.error('Error storing OTP:', err);
        res.status(500).json({ message: 'Server error while sending OTP' });
    }
});

// 2. Verify OTP
router.post('/verify-otp', async (req, res) => {
    const { mobileNumber, countryCode, otp } = req.body;
    if (!mobileNumber || !otp) {
        return res.status(400).json({ message: 'Mobile number and 6-digit OTP are required' });
    }

    const clean = mobileNumber.replace(/\D/g, '');
    const fullMobile = `${countryCode || '+91'} ${clean}`;

    // Demo OTP bypass
    if (otp === '123456') {
        return await checkCandidateAccount(fullMobile, res);
    }

    try {
        const [rows] = await db.execute(
            'SELECT * FROM otps WHERE mobile_number = ? AND otp_code = ? AND verified = 0 ORDER BY id DESC LIMIT 1',
            [fullMobile, otp]
        );
        const otpRecord = rows[0];

        if (!otpRecord) {
            return res.status(400).json({ message: 'Invalid OTP code. Please try again.' });
        }

        if (new Date(otpRecord.expires_at) < new Date()) {
            return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
        }

        await db.execute('UPDATE otps SET verified = 1 WHERE id = ?', [otpRecord.id]);
        await checkCandidateAccount(fullMobile, res);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

async function checkCandidateAccount(mobileNumber, res) {
    try {
        const [rows] = await db.execute('SELECT * FROM candidates WHERE mobile_number = ? LIMIT 1', [mobileNumber]);
        const candidate = rows[0];

        if (candidate) {
            const token = jwt.sign(
                { id: candidate.candidate_id || candidate.candidateId, role: 'jobseeker', email: candidate.email },
                process.env.JWT_SECRET || 'secret_key',
                { expiresIn: '7d' }
            );

            return res.json({
                exists: true,
                message: 'OTP verified. Welcome back!',
                candidate,
                token
            });
        } else {
            return res.json({
                exists: false,
                message: 'OTP verified. Please complete your candidate profile.',
                mobileNumber
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
}

// 3. Candidate Google Auth
router.post('/google', async (req, res) => {
    const { email, googleAccountId, fullName } = req.body;
    if (!email) return res.status(400).json({ message: 'Google email is required' });

    try {
        const [rows] = await db.execute('SELECT * FROM candidates WHERE email = ? LIMIT 1', [email]);
        const candidate = rows[0];

        if (candidate) {
            const token = jwt.sign(
                { id: candidate.candidate_id || candidate.candidateId, role: 'jobseeker', email: candidate.email },
                process.env.JWT_SECRET || 'secret_key',
                { expiresIn: '7d' }
            );
            return res.json({
                exists: true,
                candidate,
                token
            });
        } else {
            return res.json({
                exists: false,
                email,
                fullName,
                googleAccountId,
                message: 'New user via Google. Please verify mobile number to complete profile.'
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// 4. Save Candidate Profile (Multi-step)
router.post('/profile', async (req, res) => {
    const body = req.body;
    const mobile = body.mobile_number || body.phone;
    if (!mobile) return res.status(400).json({ message: 'Mobile number is required' });

    try {
        let queryStr = 'SELECT * FROM candidates WHERE mobile_number = ?';
        let queryParams = [mobile];
        if (body.email) {
            queryStr += ' OR email = ?';
            queryParams.push(body.email);
        }
        queryStr += ' LIMIT 1';
        
        const [rows] = await db.execute(queryStr, queryParams);
        const existing = rows[0];

        const profileCompletion = calculateCompletionScore(body);
        let finalId;

        if (existing) {
            finalId = existing.candidate_id || existing.candidateId;
            const updateQuery = `
                UPDATE candidates SET
                    full_name=?, profile_photo=?, date_of_birth=?, gender=?, city=?, state=?, country=?, pincode=?, address=?,
                    professional_headline=?, current_job_title=?, current_company=?, total_experience=?, experience_type=?, about_me=?,
                    resume_url=?, resume_name=?, resume_updated_at=?, profile_completed=?, profile_completion_percentage=?, updated_at=NOW()
                WHERE candidate_id=?
            `;
            const updateParams = [
                body.full_name || body.name || existing.full_name,
                body.profile_photo || body.photo || existing.profile_photo,
                body.date_of_birth || body.dob || existing.date_of_birth,
                body.gender || existing.gender,
                body.city || existing.city,
                body.state || existing.state,
                body.country || existing.country,
                body.pincode || existing.pincode,
                body.address || existing.address,
                body.professional_headline || existing.professional_headline,
                body.current_job_title || existing.current_job_title,
                body.current_company || existing.current_company,
                body.total_experience || existing.total_experience,
                body.experience_type || 'Experienced',
                body.about_me || existing.about_me,
                body.resume_url || body.resumeURL || existing.resume_url,
                body.resume_name || 'Resume.pdf',
                new Date().toISOString(),
                1,
                profileCompletion,
                finalId
            ];
            await db.execute(updateQuery, updateParams);
        } else {
            const newId = await generateCandidateId();
            finalId = body.candidate_id?.startsWith('CAND-') ? body.candidate_id : newId;

            const insertQuery = `
                INSERT INTO candidates (
                    candidate_id, mobile_number, mobile_verified, email, password_hash, google_account_id, full_name,
                    profile_photo, date_of_birth, gender, city, state, country, pincode, address, professional_headline,
                    current_job_title, current_company, total_experience, experience_type, about_me, resume_url, resume_name,
                    resume_updated_at, profile_completed, profile_completion_percentage, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `;
            const insertParams = [
                finalId, mobile, 1, body.email || '', body.password || '', body.google_account_id || '',
                body.full_name || body.name || 'Candidate', body.profile_photo || body.photo || '',
                body.date_of_birth || body.dob || '', body.gender || 'Any', body.city || '', body.state || '',
                body.country || 'India', body.pincode || '', body.address || '', body.professional_headline || '',
                body.current_job_title || '', body.current_company || '', body.total_experience || 'Fresher',
                body.experience_type || 'Fresher', body.about_me || '', body.resume_url || '', body.resume_name || '',
                new Date().toISOString(), 1, profileCompletion
            ];
            await db.execute(insertQuery, insertParams);

            if (body.email) {
                const [userRows] = await db.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [body.email]);
                if (userRows.length === 0) {
                    await db.execute(
                        'INSERT INTO users (email, password, role, phone, address, hrName) VALUES (?, ?, ?, ?, ?, ?)',
                        [body.email, body.password || 'password', 'jobseeker', mobile, body.address || '', body.full_name || body.name || '']
                    );
                }
            }
        }

        await saveSubTables(finalId, body);

        const token = jwt.sign(
            { id: finalId, role: 'jobseeker', email: body.email },
            process.env.JWT_SECRET || 'secret_key',
            { expiresIn: '7d' }
        );

        res.status(existing ? 200 : 201).json({
            message: existing ? '🎉 Your Profile Has Been Updated Successfully!' : '🎉 Your Profile Has Been Created Successfully!',
            candidate_id: finalId,
            profile_completion_percentage: profileCompletion,
            token
        });

    } catch (err) {
        console.error('Error saving profile:', err);
        res.status(500).json({ message: 'Error saving profile: ' + err.message });
    }
});

function calculateCompletionScore(body) {
    let score = 0;
    if (body.full_name || body.name) score += 15;
    if (body.email && (body.mobile_number || body.phone)) score += 15;
    if (body.education && body.education.length > 0) score += 20;
    if (body.experience && body.experience.length > 0) score += 15;
    if (body.skills && (typeof body.skills === 'string' ? body.skills : body.skills.length > 0)) score += 15;
    if (body.resume_url || body.resumeURL) score += 10;
    if (body.career_preferences || body.preferred_roles) score += 10;
    return Math.min(100, Math.max(score, 40));
}

async function saveSubTables(candidateId, body) {
    // Education
    if (Array.isArray(body.education)) {
        await db.execute('DELETE FROM candidate_education WHERE candidate_id = ?', [candidateId]);
        for (const edu of body.education) {
            await db.execute(
                `INSERT INTO candidate_education (candidate_id, qualification, degree, specialization, institution, university, start_year, end_year, percentage, cgpa)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    candidateId, edu.qualification || '', edu.degree || '', edu.specialization || '',
                    edu.institution || '', edu.university || '', edu.start_year || '', edu.end_year || '',
                    String(edu.percentage || ''), String(edu.cgpa || '')
                ]
            );
        }
    }

    // Experience
    if (Array.isArray(body.experience)) {
        await db.execute('DELETE FROM candidate_experience WHERE candidate_id = ?', [candidateId]);
        for (const exp of body.experience) {
            await db.execute(
                `INSERT INTO candidate_experience (candidate_id, company_name, job_title, employment_type, start_date, end_date, currently_working, location, description)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    candidateId, exp.company_name || '', exp.job_title || '', exp.employment_type || 'Full Time',
                    exp.start_date || '', exp.end_date || '', exp.currently_working ? 1 : 0, exp.location || '',
                    exp.description || ''
                ]
            );
        }
    }

    // Skills
    if (body.skills) {
        await db.execute('DELETE FROM candidate_skills WHERE candidate_id = ?', [candidateId]);
        const skillList = Array.isArray(body.skills) ? body.skills : String(body.skills).split(',').map(s => s.trim()).filter(Boolean);
        for (const sk of skillList) {
            const name = typeof sk === 'object' ? sk.name : sk;
            const cat = typeof sk === 'object' ? sk.category : 'Technical';
            if (name) {
                await db.execute(
                    'INSERT INTO candidate_skills (candidate_id, skill_name, skill_category) VALUES (?, ?, ?)',
                    [candidateId, name, cat]
                );
            }
        }
    }

    // Career Preferences
    if (body.career_preferences || body.preferred_locations || body.preferred_roles || body.preferences) {
        const pref = body.career_preferences || body.preferences || body;
        await db.execute('DELETE FROM career_preferences WHERE candidate_id = ?', [candidateId]);
        
        await db.execute(
            `INSERT INTO career_preferences (
                candidate_id, preferred_job_types, preferred_locations, preferred_work_modes, minimum_salary, maximum_salary, notice_period, preferred_roles
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                candidateId,
                Array.isArray(pref.preferred_job_types) ? pref.preferred_job_types.join(',') : pref.preferred_job_types || '',
                Array.isArray(pref.preferred_locations) ? pref.preferred_locations.join(',') : pref.preferred_locations || '',
                pref.preferred_work_modes || pref.work_mode || 'Any',
                String(pref.minimum_salary || ''),
                String(pref.maximum_salary || ''),
                pref.notice_period || 'Immediate Joiner',
                Array.isArray(pref.preferred_roles) ? pref.preferred_roles.join(',') : pref.preferred_roles || ''
            ]
        );
    }
}

// 5. Get Candidate Profile
router.get('/profile/:id', async (req, res) => {
    const candidateId = req.params.id;
    try {
        const [rows] = await db.execute(
            'SELECT * FROM candidates WHERE candidate_id = ? OR email = ? OR mobile_number = ? LIMIT 1',
            [candidateId, candidateId, candidateId]
        );
        const candidate = rows[0];

        if (!candidate) return res.status(404).json({ message: 'Candidate profile not found' });

        const [education] = await db.execute('SELECT * FROM candidate_education WHERE candidate_id = ?', [candidate.candidate_id]);
        const [experience] = await db.execute('SELECT * FROM candidate_experience WHERE candidate_id = ?', [candidate.candidate_id]);
        const [skills] = await db.execute('SELECT * FROM candidate_skills WHERE candidate_id = ?', [candidate.candidate_id]);
        const [prefRows] = await db.execute('SELECT * FROM career_preferences WHERE candidate_id = ? LIMIT 1', [candidate.candidate_id]);
        const preferences = prefRows[0];

        res.json({
            ...candidate,
            education: education || [],
            experience: experience || [],
            skills: skills.map(s => s.skill_name || s.skillName),
            career_preferences: preferences || {}
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// 6. Save/Unsave Job
router.post('/save-job', verifyToken, async (req, res) => {
    const { candidateId, jobId } = req.body;
    const cid = candidateId || String(req.user.id);
    if (!jobId) return res.status(400).json({ message: 'Job ID is required' });

    try {
        const [rows] = await db.execute('SELECT * FROM saved_jobs WHERE candidate_id = ? AND job_id = ? LIMIT 1', [cid, parseInt(jobId)]);
        const existing = rows[0];

        if (!existing) {
            await db.execute('INSERT INTO saved_jobs (candidate_id, job_id, saved_at) VALUES (?, ?, NOW())', [cid, parseInt(jobId)]);
        }
        res.json({ message: 'Job saved successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error saving job' });
    }
});

router.delete('/save-job/:jobId', verifyToken, async (req, res) => {
    const candidateId = String(req.user.id);
    const jobId = parseInt(req.params.jobId);

    try {
        await db.execute(
            'DELETE FROM saved_jobs WHERE (candidate_id = ? OR candidate_id = ?) AND job_id = ?',
            [candidateId, req.user.email, jobId]
        );
        res.json({ message: 'Job removed from saved jobs' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error unsaving job' });
    }
});

router.get('/saved-jobs/:candidateId', async (req, res) => {
    const cid = req.params.candidateId;
    try {
        const [savedJobs] = await db.execute('SELECT * FROM saved_jobs WHERE candidate_id = ? ORDER BY saved_at DESC', [cid]);
        
        if (savedJobs.length === 0) return res.json([]);
        
        const jobIds = savedJobs.map(s => s.job_id || s.jobId);
        const placeholders = jobIds.map(() => '?').join(',');
        
        const [jobs] = await db.execute(`SELECT * FROM jobs WHERE id IN (${placeholders})`, jobIds);
        
        res.json(jobs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching saved jobs' });
    }
});

// 7. Get Recommended Jobs
router.get('/recommended-jobs/:candidateId', async (req, res) => {
    const cid = req.params.candidateId;

    try {
        const [candRows] = await db.execute('SELECT * FROM candidates WHERE candidate_id = ? OR email = ? LIMIT 1', [cid, cid]);
        const candidate = candRows[0];

        const [activeJobs] = await db.execute('SELECT * FROM jobs WHERE status IN ("active", "open") LIMIT 50');

        if (!candidate) {
            return res.json(activeJobs.slice(0, 10));
        }

        const [skills] = await db.execute('SELECT * FROM candidate_skills WHERE candidate_id = ?', [candidate.candidate_id]);
        const [prefRows] = await db.execute('SELECT * FROM career_preferences WHERE candidate_id = ? LIMIT 1', [candidate.candidate_id]);
        const preferences = prefRows[0];

        const candidateSkillNames = skills.map(s => (s.skill_name || s.skillName || '').toLowerCase());
        const prefLocations = preferences?.preferred_locations ? preferences.preferred_locations.toLowerCase() : '';

        const scored = activeJobs.map(job => {
            let score = 50;
            const jobSkills = (job.requiredSkills || job.skills || '').toLowerCase();
            const jobLoc = (job.location || '').toLowerCase();

            candidateSkillNames.forEach(sk => {
                if (sk && jobSkills.includes(sk)) score += 15;
            });

            if (prefLocations && jobLoc && prefLocations.includes(jobLoc)) {
                score += 20;
            }

            return {
                ...job,
                matchScore: Math.min(99, score)
            };
        });

        scored.sort((a, b) => b.matchScore - a.matchScore);
        res.json(scored.slice(0, 12));

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching recommended jobs' });
    }
});

module.exports = router;

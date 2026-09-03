const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');

// Registration Endpoint
router.post('/register', async (req, res) => {
    const { email, password, role, companyName, hrName, phone, address } = req.body;

    if (!email || !password || !role) {
        return res.status(400).json({ message: 'Email, password, and role are required' });
    }

    if (!['jobseeker', 'company', 'admin'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
    }

    try {
        const [existing] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(400).json({ message: 'User already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [result] = await db.execute(
            'INSERT INTO users (email, password, role, companyName, hrName, phone, address) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [email, hashedPassword, role, companyName || null, hrName || null, phone || null, address || null]
        );
        
        res.status(201).json({ message: 'User registered successfully', userId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Login Endpoint
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        const user = rows[0];
        
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const payload = {
            id: user.id,
            email: user.email,
            role: user.role
        };
        const jwtSecret = process.env.JWT_SECRET || 'job_portal_super_secret_jwt_key_2026';
        const token = jwt.sign(payload, jwtSecret, { expiresIn: '1d' });

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                isPremium: user.isPremium,
                applicationCount: user.applicationCount,
                phone: user.phone,
                address: user.address,
                companyName: user.companyName,
                hrName: user.hrName
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Get Current User Profile (Protected)
router.get('/me', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT id, email, role, isPremium, applicationCount, phone, address, companyName, hrName, createdAt FROM users WHERE id = ?',
            [req.user.id]
        );
        const user = rows[0];
        
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Change Password (Protected)
router.put('/change-password', verifyToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current and new password are required' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [req.user.id]);
        const user = rows[0];
        
        if (!user) return res.status(500).json({ message: 'User not found' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Current password is incorrect' });

        const hashed = await bcrypt.hash(newPassword, 10);
        await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
        
        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating password' });
    }
});

// Generate Token for external AI Career Analyzer
router.post('/analyzer-token', (req, res) => {
    const candidateData = req.body;
    if (!candidateData || !candidateData.email) {
        return res.status(400).json({ message: 'Candidate data with email is required' });
    }
    const token = jwt.sign(
        { candidate: candidateData, source: 'job_portal', timestamp: Date.now() }, 
        process.env.JWT_SECRET || 'fallback_secret', 
        { expiresIn: '1h' }
    );
    res.json({ token });
});

// ==================== EMPLOYER OTP & LOGIN FLOW ====================

// 1. Send OTP to Mobile Number
router.post('/send-otp', async (req, res) => {
    const { phone, countryCode = '+91' } = req.body;
    if (!phone) {
        return res.status(400).json({ message: 'Mobile number is required' });
    }
    const fullPhone = phone.startsWith('+') ? phone : `${countryCode} ${phone}`;
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        console.log(`[OTP SENT] To ${fullPhone}: ${otpCode}`);
        res.json({
            message: `OTP sent to ${fullPhone}`,
            fullPhone,
            otpCode, 
            expiresInSeconds: 30
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to send OTP' });
    }
});

// 2. Verify OTP Code
router.post('/verify-otp', async (req, res) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
        return res.status(400).json({ message: 'Phone number and OTP code are required' });
    }

    try {
        const cleanPhone = phone.replace(/\s+/g, '');
        
        const [userRows] = await db.execute('SELECT * FROM users WHERE role = "company" AND phone LIKE ? LIMIT 1', [`%${cleanPhone}%`]);
        const user = userRows[0];

        if (user) {
            const [companyRows] = await db.execute('SELECT * FROM companies WHERE companyEmail = ? LIMIT 1', [user.email]);
            const company = companyRows[0];
            
            const jwtSecret = process.env.JWT_SECRET || 'secret_key';
            const token = jwt.sign({ id: user.id, email: user.email, role: 'company' }, jwtSecret, { expiresIn: '7d' });
            
            return res.json({
                message: 'OTP verified successfully',
                verified: true,
                exists: true,
                token,
                employer: {
                    employer_id: `emp_${user.id}`,
                    email: user.email,
                    mobile_number: user.phone,
                    company_id: company?.companyId || `comp_${user.id}`,
                    companyName: company?.companyName || user.companyName || 'Company',
                    logoURL: company?.companyLogo || ''
                }
            });
        } else {
            return res.json({
                message: 'Mobile number verified successfully',
                verified: true,
                exists: false
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// 3. Employer Login Endpoint (Email + Password)
router.post('/employer/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    try {
        const [userRows] = await db.execute('SELECT * FROM users WHERE email = ? AND role = "company" LIMIT 1', [email]);
        const user = userRows[0];
        
        if (!user) return res.status(401).json({ message: 'No employer account found with this email' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Incorrect email or password' });

        const [companyRows] = await db.execute('SELECT * FROM companies WHERE companyEmail = ? LIMIT 1', [email]);
        const company = companyRows[0];
        
        const jwtSecret = process.env.JWT_SECRET || 'secret_key';
        const token = jwt.sign({ id: user.id, email: user.email, role: 'company' }, jwtSecret, { expiresIn: '7d' });

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: `emp_${user.id}`,
                uid: `emp_${user.id}`,
                email: user.email,
                role: 'company',
                companyName: company?.companyName || user.companyName || 'Company',
                hrName: user.hrName,
                phone: user.phone,
                company_id: company?.companyId || `comp_${user.id}`,
                logoURL: company?.companyLogo || ''
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// 4. Google Auth Endpoint
router.post('/employer/google-login', async (req, res) => {
    const { email, name, googleId } = req.body;
    if (!email) return res.status(400).json({ message: 'Google email is required' });

    try {
        const [userRows] = await db.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
        const user = userRows[0];
        
        if (user) {
            const [companyRows] = await db.execute('SELECT * FROM companies WHERE companyEmail = ? LIMIT 1', [email]);
            const company = companyRows[0];
            
            const jwtSecret = process.env.JWT_SECRET || 'secret_key';
            const token = jwt.sign({ id: user.id, email: user.email, role: 'company' }, jwtSecret, { expiresIn: '7d' });
            
            return res.json({
                exists: true,
                message: 'Google login successful',
                token,
                user: {
                    id: `emp_${user.id}`,
                    uid: `emp_${user.id}`,
                    email: user.email,
                    role: 'company',
                    companyName: company?.companyName || user.companyName || 'Company',
                    company_id: company?.companyId || `comp_${user.id}`
                }
            });
        } else {
            return res.json({
                exists: false,
                requiresMobileVerification: true,
                email,
                name
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// 5. Create Company Profile Endpoint
router.post('/employer/create-profile', async (req, res) => {
    const data = req.body;
    if (!data.companyName || !data.contactPersonName || !data.mobileNumber || !data.email) {
        return res.status(400).json({ message: 'Required fields missing' });
    }

    try {
        const timestamp = Date.now();
        const employerId = `emp_${timestamp}_${Math.floor(Math.random()*1000)}`;
        const companyId = `comp_${timestamp}_${Math.floor(Math.random()*1000)}`;
        const hashedPassword = await bcrypt.hash(data.password || 'password123', 10);

        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            const [userResult] = await connection.execute(
                'INSERT INTO users (email, password, role, companyName, hrName, phone, address) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [data.email, hashedPassword, 'company', data.companyName, data.contactPersonName, data.mobileNumber, `${data.address || ''} ${data.city || ''}`.trim()]
            );

            const userId = userResult.insertId;

            await connection.execute(
                `INSERT INTO companies (
                    companyId, employerId, companyName, companyLogo, website, companyEmail, 
                    companyPhone, industry, companyType, companySize, yearEstablished, 
                    registrationNumber, gstNumber, description, address, city, state, country, pincode
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    companyId, employerId, data.companyName, data.companyLogo || '', data.website || '',
                    data.companyEmail || data.email, data.companyPhone || data.mobileNumber,
                    data.industry || '', data.companyType || '', data.companySize || '',
                    data.yearEstablished || '', data.registrationNumber || '', data.gstNumber || '',
                    data.description || '', data.address || '', data.city || '', data.state || '',
                    data.country || 'India', data.pincode || ''
                ]
            );

            await connection.commit();
            connection.release();

            const jwtSecret = process.env.JWT_SECRET || 'secret_key';
            const token = jwt.sign({ id: userId, email: data.email, role: 'company' }, jwtSecret, { expiresIn: '7d' });

            res.status(201).json({
                message: 'Company Profile Created Successfully!',
                token,
                employerId,
                companyId,
                user: {
                    id: employerId,
                    uid: employerId,
                    company_id: companyId,
                    companyName: data.companyName,
                    contactPersonName: data.contactPersonName,
                    email: data.email,
                    mobileNumber: data.mobileNumber,
                    role: 'company',
                    logoURL: data.companyLogo || '',
                    profile_completed: 1
                }
            });

        } catch (txErr) {
            await connection.rollback();
            connection.release();
            throw txErr;
        }

    } catch (err) {
        console.error('Create profile server error:', err);
        res.status(500).json({ message: 'Failed to create company profile' });
    }
});

module.exports = router;

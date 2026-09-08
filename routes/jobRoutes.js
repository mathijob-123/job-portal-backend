const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');

// Haversine formula to calculate distance in km between two GPS coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const p1 = parseFloat(lat1);
    const l1 = parseFloat(lon1);
    const p2 = parseFloat(lat2);
    const l2 = parseFloat(lon2);
    if (isNaN(p1) || isNaN(l1) || isNaN(p2) || isNaN(l2)) return null;

    const R = 6371;
    const dLat = (p2 - p1) * Math.PI / 180;
    const dLon = (l2 - l1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(p1 * Math.PI / 180) * Math.cos(p2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
}

const CITY_COORDINATES = {
    'bangalore': { lat: 12.9716, lng: 77.5946 },
    'bengaluru': { lat: 12.9716, lng: 77.5946 },
    'mumbai': { lat: 19.0760, lng: 72.8777 },
    'delhi': { lat: 28.6139, lng: 77.2090 },
    'new delhi': { lat: 28.6139, lng: 77.2090 },
    'noida': { lat: 28.5355, lng: 77.3910 },
    'gurgaon': { lat: 28.4595, lng: 77.0266 },
    'gurugram': { lat: 28.4595, lng: 77.0266 },
    'chennai': { lat: 13.0827, lng: 80.2707 },
    'hyderabad': { lat: 17.3850, lng: 78.4867 },
    'pune': { lat: 18.5204, lng: 73.8567 },
    'kolkata': { lat: 22.5726, lng: 88.3639 },
    'ahmedabad': { lat: 23.0225, lng: 72.5714 },
    'jaipur': { lat: 26.9124, lng: 75.7873 },
    'chandigarh': { lat: 30.7333, lng: 76.7794 },
    'kochi': { lat: 9.9312, lng: 76.2673 },
    'coimbatore': { lat: 11.0168, lng: 76.9558 },
    'indore': { lat: 22.7196, lng: 75.8577 },
    'surat': { lat: 21.1702, lng: 72.8311 }
};

async function autoExpireJobs() {
    const today = new Date().toISOString().split('T')[0];
    await db.execute(
        'UPDATE jobs SET status = "expired" WHERE status IN ("active", "open") AND applicationDeadline IS NOT NULL AND applicationDeadline != "" AND applicationDeadline < ?',
        [today]
    );
}

// Post a New Job
router.post('/post', verifyToken, async (req, res) => {
    if (req.user.role !== 'company' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Only recruiters can post jobs' });
    }

    const body = req.body;
    const jobIdStr = body.job_id || body.jobId || `JOB-${Date.now()}`;
    const status = body.status || 'active';
    const employerId = `emp_${req.user.id}`;
    const companyId = req.user.id;

    let lat = body.latitude || body.lat || '';
    let lng = body.longitude || body.lng || '';
    if ((!lat || !lng) && body.city) {
        const cityKey = body.city.toLowerCase().trim();
        if (CITY_COORDINATES[cityKey]) {
            lat = String(CITY_COORDINATES[cityKey].lat);
            lng = String(CITY_COORDINATES[cityKey].lng);
        }
    }

    try {
        const query = `
            INSERT INTO jobs (
                job_id, employer_id, company_id, title, description, location, location_type, 
                number_of_openings, experience_type, minimum_experience, maximum_experience, education, 
                required_skills, preferred_skills, salary, minimum_salary, maximum_salary, salary_type, 
                salary_negotiable, company_name, company_logo, application_deadline, jobtype, 
                latitude, longitude, geo_address, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            jobIdStr, employerId, companyId, body.job_title || body.title || 'Untitled Role',
            body.job_description || body.description || '', body.job_location || body.location || '',
            body.location_type || 'On-site', Number(body.number_of_openings) || 1,
            body.experience_type || 'Any Experience', String(body.minimum_experience || ''),
            String(body.maximum_experience || ''), body.education || '',
            body.required_skills || body.skills || '', body.preferred_skills || '',
            body.salary || '', String(body.minimum_salary || ''), String(body.maximum_salary || ''),
            body.salary_type || 'Monthly', body.salary_negotiable ? 1 : 0,
            body.company_name || body.companyName || '', body.company_logo || body.companyLogo || '',
            body.application_deadline || '', body.job_type || body.jobType || 'Full Time',
            lat, lng, body.geo_address || body.job_location || body.location || '', status
        ];

        const [result] = await db.execute(query, values);

        res.status(201).json({
            message: status === 'draft' ? 'Draft saved successfully' : 'Job posted successfully!',
            jobId: jobIdStr,
            id: result.insertId,
            latitude: lat,
            longitude: lng
        });
    } catch (err) {
        console.error('Error inserting job into DB:', err.message);
        res.status(500).json({ message: 'Error posting job: ' + err.message });
    }
});

// Update Job Details
router.put('/:id', verifyToken, async (req, res) => {
    const idParam = req.params.id;
    const body = req.body;

    let lat = body.latitude || body.lat || '';
    let lng = body.longitude || body.lng || '';
    if ((!lat || !lng) && body.city) {
        const cityKey = body.city.toLowerCase().trim();
        if (CITY_COORDINATES[cityKey]) {
            lat = String(CITY_COORDINATES[cityKey].lat);
            lng = String(CITY_COORDINATES[cityKey].lng);
        }
    }

    try {
        const [rows] = await db.execute('SELECT * FROM jobs WHERE id = ? OR job_id = ? LIMIT 1', [idParam, idParam]);
        const job = rows[0];

        if (!job) return res.status(404).json({ message: 'Job not found' });
        
        if (job.companyId != req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Unauthorized to update this job' });
        }

        const title = body.job_title || body.title || job.title;
        const description = body.job_description || body.description || job.description;
        const location = body.job_location || body.location || job.location;
        const locationType = body.location_type || job.locationType;
        const numberOfOpenings = Number(body.number_of_openings) || job.numberOfOpenings;
        const experienceType = body.experience_type || job.experienceType;
        const minExperience = String(body.minimum_experience || job.minExperience);
        const maxExperience = String(body.maximum_experience || job.maxExperience);
        const education = body.education || job.education;
        const requiredSkills = body.required_skills || body.skills || job.requiredSkills;
        const preferredSkills = body.preferred_skills || job.preferredSkills;
        const salary = body.salary || job.salary;
        const minSalary = String(body.minimum_salary || job.minSalary);
        const maxSalary = String(body.maximum_salary || job.maxSalary);
        const salaryType = body.salary_type || job.salaryType;
        const salaryNegotiable = body.salary_negotiable !== undefined ? (body.salary_negotiable ? 1 : 0) : job.salaryNegotiable;
        const applicationDeadline = body.application_deadline || job.applicationDeadline;
        const jobType = body.job_type || body.jobType || job.jobType;
        const finalLat = lat || job.latitude;
        const finalLng = lng || job.longitude;
        const geoAddress = body.geo_address || body.job_location || body.location || job.geoAddress;
        const status = body.status || job.status;

        const query = `
            UPDATE jobs SET 
                title=?, description=?, location=?, location_type=?, number_of_openings=?, 
                experience_type=?, minimum_experience=?, maximum_experience=?, education=?, 
                required_skills=?, preferred_skills=?, salary=?, minimum_salary=?, maximum_salary=?, 
                salary_type=?, salary_negotiable=?, application_deadline=?, jobtype=?, 
                latitude=?, longitude=?, geo_address=?, status=?
            WHERE id = ?
        `;
        const values = [
            title, description, location, locationType, numberOfOpenings,
            experienceType, minExperience, maxExperience, education,
            requiredSkills, preferredSkills, salary, minSalary, maxSalary,
            salaryType, salaryNegotiable, applicationDeadline, jobType,
            finalLat, finalLng, geoAddress, status, job.id
        ];

        await db.execute(query, values);

        res.json({ message: 'Job updated successfully', latitude: finalLat, longitude: finalLng });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating job: ' + err.message });
    }
});

// Update Job Status (Pause, Activate, Close, Draft)
router.put('/:id/status', verifyToken, async (req, res) => {
    const { status } = req.body;
    const idParam = req.params.id;
    
    try {
        const [rows] = await db.execute('SELECT * FROM jobs WHERE id = ? OR job_id = ? LIMIT 1', [idParam, idParam]);
        const job = rows[0];

        if (!job) return res.status(404).json({ message: 'Job not found' });
        if (job.companyId != req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        await db.execute('UPDATE jobs SET status = ? WHERE id = ?', [status, job.id]);

        res.json({ message: `Job status updated to ${status}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating job status' });
    }
});

// Get All Public Active Jobs
router.get('/all', async (req, res) => {
    const { lat, lng, radius, search, city } = req.query;

    try {
        await autoExpireJobs();
        
        let query = 'SELECT * FROM jobs WHERE status IN ("active", "open")';
        let queryParams = [];

        if (city) {
            query += ' AND (location LIKE ? OR geo_address LIKE ?)';
            queryParams.push(`%${city}%`, `%${city}%`);
        }

        query += ' ORDER BY posted_at DESC';

        const [jobs] = await db.execute(query, queryParams);

        let result = jobs.map(j => {
            let jobLat = j.latitude;
            let jobLng = j.longitude;

            if ((!jobLat || !jobLng) && j.location) {
                const ck = j.location.split(',')[0].toLowerCase().trim();
                if (CITY_COORDINATES[ck]) {
                    jobLat = String(CITY_COORDINATES[ck].lat);
                    jobLng = String(CITY_COORDINATES[ck].lng);
                }
            }

            let distance_km = null;
            if (lat && lng && jobLat && jobLng) {
                distance_km = calculateDistance(lat, lng, jobLat, jobLng);
            }

            return {
                ...j,
                latitude: jobLat || null,
                longitude: jobLng || null,
                distance_km: distance_km
            };
        });

        if (lat && lng && radius && !isNaN(parseFloat(radius))) {
            const maxR = parseFloat(radius);
            result = result.filter(j => j.distance_km !== null && j.distance_km <= maxR);
            result.sort((a, b) => (a.distance_km || 99999) - (b.distance_km || 99999));
        } else if (lat && lng) {
            result.sort((a, b) => {
                if (a.distance_km !== null && b.distance_km !== null) return a.distance_km - b.distance_km;
                if (a.distance_km !== null) return -1;
                if (b.distance_km !== null) return 1;
                return 0;
            });
        }

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching jobs' });
    }
});

// Dedicated Geo-Location Nearby Jobs API
router.get('/nearby', async (req, res) => {
    const { lat, lng, radius = 25 } = req.query;
    if (!lat || !lng) {
        return res.status(400).json({ message: 'Latitude and Longitude parameters are required' });
    }

    try {
        await autoExpireJobs();
        const [jobs] = await db.execute('SELECT * FROM jobs WHERE status IN ("active", "open")');

        const maxR = parseFloat(radius);
        const userLat = parseFloat(lat);
        const userLng = parseFloat(lng);

        let nearby = jobs.map(j => {
            let jobLat = j.latitude;
            let jobLng = j.longitude;
            const dist = calculateDistance(userLat, userLng, jobLat, jobLng);
            return { ...j, distance_km: dist };
        }).filter(j => j.distance_km !== null && j.distance_km <= maxR);

        nearby.sort((a, b) => a.distance_km - b.distance_km);

        res.json({
            userCoordinates: { latitude: userLat, longitude: userLng },
            radiusKm: maxR,
            totalFound: nearby.length,
            jobs: nearby
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error querying nearby jobs' });
    }
});

// Get Employer Jobs
router.get('/company', verifyToken, async (req, res) => {
    try {
        await autoExpireJobs();
        const [jobs] = await db.execute(
            'SELECT * FROM jobs WHERE companyId = ? OR employerId = ? ORDER BY postedAt DESC',
            [req.user.id, `emp_${req.user.id}`]
        );
        res.json(jobs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching company jobs' });
    }
});

// Get Single Job by ID
router.get('/:id', async (req, res) => {
    const idParam = req.params.id;
    try {
        const [rows] = await db.execute('SELECT * FROM jobs WHERE id = ? OR jobId = ? LIMIT 1', [idParam, idParam]);
        const job = rows[0];
        if (!job) return res.status(404).json({ message: 'Job not found' });
        res.json(job);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/jobs', require('./routes/jobRoutes'));
app.use('/api/applications', require('./routes/applicationRoutes'));
app.use('/api/subscriptions', require('./routes/subscriptionRoutes'));
app.use('/api/plans', require('./routes/planRoutes'));
app.use('/api/employer', require('./routes/employerRoutes'));
app.use('/api/candidate', require('./routes/candidateRoutes'));
app.use('/api/assessments', require('./routes/assessmentRoutes'));
app.use('/api/mentors', require('./routes/mentorRoutes'));

app.use('/api/interviews', require('./routes/interviewRoutes'));
app.use('/api/data-requests', require('./routes/dataRequestRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));

// Public direct endpoints for SEO crawlers
const settingsRouter = require('./routes/settingsRoutes');
app.get('/robots.txt', (req, res, next) => settingsRouter(req, res, next));
app.get('/sitemap.xml', (req, res, next) => settingsRouter(req, res, next));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Job Portal API is running', env: process.env.NODE_ENV });
});

// Start server locally (Vercel imports this without calling listen)
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}


// Export for Vercel serverless function
module.exports = app;


-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS job_portal_db;
USE job_portal_db;

-- Drop tables if they exist to start fresh
DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS saved_jobs;
DROP TABLE IF EXISTS contact_messages;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS employers;
DROP TABLE IF EXISTS companies;
DROP TABLE IF EXISTS users;

-- Users Table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'employer', 'jobseeker') NOT NULL DEFAULT 'jobseeker',
    phone VARCHAR(20),
    address TEXT,
    isPremium BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Companies Table
CREATE TABLE companies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    website VARCHAR(255),
    location VARCHAR(255),
    logoUrl VARCHAR(255),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Employers Table
CREATE TABLE employers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    companyId INT,
    hrName VARCHAR(255),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE SET NULL
);

-- Jobs Table
CREATE TABLE jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    companyId INT NOT NULL,
    employerId INT NOT NULL,
    location VARCHAR(255),
    salary VARCHAR(100),
    experience VARCHAR(100),
    skills TEXT,
    jobType VARCHAR(100),
    googleFormLink VARCHAR(255),
    cgpa VARCHAR(50),
    status ENUM('active', 'closed') DEFAULT 'active',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (employerId) REFERENCES employers(id) ON DELETE CASCADE
);

-- Applications Table
CREATE TABLE applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    jobId INT NOT NULL,
    applicantId INT NOT NULL,
    resumeUrl VARCHAR(255),
    coverLetter TEXT,
    status ENUM('pending', 'reviewed', 'shortlisted', 'rejected', 'accepted') DEFAULT 'pending',
    appliedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jobId) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (applicantId) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_application (jobId, applicantId)
);

-- Saved Jobs Table
CREATE TABLE saved_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    jobId INT NOT NULL,
    userId INT NOT NULL,
    savedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jobId) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_saved_job (jobId, userId)
);

-- Notifications Table
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    isRead BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- Contact Messages Table
CREATE TABLE contact_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    message TEXT NOT NULL,
    isRead BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

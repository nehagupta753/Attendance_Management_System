-- Attendance Management System Schema
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL
);

CREATE TABLE teachers (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    department VARCHAR(100),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'active',
    is_coordinator BOOLEAN DEFAULT FALSE,
    coordinator_class INT
);

CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    enrollment VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    year VARCHAR(10),
    branch VARCHAR(100),
    section VARCHAR(10)
);

CREATE TABLE attendance (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id),
    teacher_id INT REFERENCES teachers(id),
    subject_id VARCHAR(100),
    date DATE NOT NULL,
    status VARCHAR(20) NOT NULL
);

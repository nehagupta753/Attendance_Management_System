-- Seed Data
INSERT INTO users (email, password_hash, role) VALUES ('admin@acropolis.in', 'hashed_pwd', 'admin');
INSERT INTO teachers (employee_id, name, department, email) VALUES ('EMP001', 'Dr. Smith', 'CS', 'smith@acropolis.in');
INSERT INTO students (enrollment, name, email, year, branch, section) VALUES ('0827CS221001', 'John Doe', 'john@student.in', '3rd', 'CS', '1');

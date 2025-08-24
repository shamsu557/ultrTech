const mysql = require('mysql');

// MySQL database connection configuration
const dbConfig = {
    host: process.env.DB_HOST || 'mysql-shamsu557.alwaysdata.net',  // Use environment variable or default
    port: process.env.DB_PORT || 3306,                       // Default MySQL port or environment variable
    user: process.env.DB_USER || 'shamsu557',               // MySQL username from environment
    password: process.env.DB_PASSWORD || '@Shamsu1440',       // MySQL password from environment
    database: process.env.DB_NAME || 'shamsu557_ultra_tech_dbase'            // Database name from environment
};

// Create MySQL connection
const db = mysql.createConnection(dbConfig);

// Connect to MySQL database
db.connect((err) => {
    if (err) { 
        console.error('Error connecting to MySQL database:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// Export the database connection
module.exports = db;

// -- UltraTech Global Solution School Management Database Schema

// -- Courses table
// CREATE TABLE IF NOT EXISTS courses (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     name VARCHAR(100) NOT NULL,
//     abbreviation VARCHAR(10) NOT NULL,
//     duration VARCHAR(50) NOT NULL,
//     schedule VARCHAR(50) NOT NULL, -- weekend, morning, evening
//     certification_type ENUM('Certificate', 'Diploma', 'Advanced Diploma') DEFAULT 'Certificate',
//     description TEXT,
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );

// -- Students table
// CREATE TABLE IF NOT EXISTS students (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     application_number VARCHAR(20) UNIQUE,
//     reference_number VARCHAR(255),
//     amount DECIMAL(10,2),
//     payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
//     admission_number VARCHAR(30) UNIQUE,
//     first_name VARCHAR(50) NOT NULL,
//     last_name VARCHAR(50) NOT NULL,
//     email VARCHAR(100) UNIQUE NOT NULL,
//     phone VARCHAR(20) NOT NULL,
//     gender ENUM('Male', 'Female') NOT NULL,
//     date_of_birth DATE,
//     address TEXT,
//     course_id INT,
//     password_hash VARCHAR(255),
//     security_question VARCHAR(255),
//     security_answer VARCHAR(255),
//     highest_qualification VARCHAR(100),
//     profile_picture VARCHAR(255),
//     schedule VARCHAR(50),
//     status ENUM('Applied', 'Registered', 'Active', 'Completed', 'Suspended') DEFAULT 'Applied',
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     FOREIGN KEY (course_id) REFERENCES courses(id)
// );

// -- Staff table
// CREATE TABLE IF NOT EXISTS staff (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     staff_id VARCHAR(20) UNIQUE NOT NULL,
//     first_name VARCHAR(50) NOT NULL,
//     last_name VARCHAR(50) NOT NULL,
//     email VARCHAR(100) UNIQUE NOT NULL,
//     phone VARCHAR(20),
//     password_hash VARCHAR(255),
//     profile_picture VARCHAR(255),
//     is_registered BOOLEAN DEFAULT FALSE,
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );

// -- Staff courses (many-to-many relationship)
// CREATE TABLE IF NOT EXISTS staff_courses (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     staff_id INT,
//     course_id INT,
//     FOREIGN KEY (staff_id) REFERENCES staff(id),
//     FOREIGN KEY (course_id) REFERENCES courses(id)
// );

// -- Admins table
// CREATE TABLE IF NOT EXISTS admins (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     username VARCHAR(50) UNIQUE NOT NULL,
//     password_hash VARCHAR(255) NOT NULL,
//     role ENUM('Admin', 'Deputy Admin', 'Assistant Admin') DEFAULT 'Assistant Admin',
//     first_name VARCHAR(50),
//     last_name VARCHAR(50),
//     email VARCHAR(100),
//     is_first_login BOOLEAN DEFAULT TRUE,
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );

// -- Payments table
// CREATE TABLE IF NOT EXISTS payments (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     student_id INT,
//     payment_type ENUM('Application', 'Registration', 'Exam', 'Certificate') NOT NULL,
//     amount DECIMAL(10,2) NOT NULL,
//     reference_number VARCHAR(100) UNIQUE NOT NULL,
//     paystack_reference VARCHAR(100),
//     installment_number INT DEFAULT 1,
//     total_installments INT DEFAULT 1,
//     status ENUM('Pending', 'Completed', 'Failed') DEFAULT 'Pending',
//     payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     FOREIGN KEY (student_id) REFERENCES students(id)
// );

// -- Assignments table
// CREATE TABLE IF NOT EXISTS assignments (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     course_id INT,
//     staff_id INT,
//     title VARCHAR(200) NOT NULL,
//     description TEXT,
//     instructions TEXT,
//     date_given DATE NOT NULL,
//     due_date DATE NOT NULL,
//     max_score INT DEFAULT 100,
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     FOREIGN KEY (course_id) REFERENCES courses(id),
//     FOREIGN KEY (staff_id) REFERENCES staff(id)
// );

// -- Assignment submissions table
// CREATE TABLE IF NOT EXISTS assignment_submissions (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     assignment_id INT,
//     student_id INT,
//     file_path VARCHAR(255),
//     submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     score INT,
//     feedback TEXT,
//     graded_by INT,
//     graded_at TIMESTAMP NULL,
//     FOREIGN KEY (assignment_id) REFERENCES assignments(id),
//     FOREIGN KEY (student_id) REFERENCES students(id),
//     FOREIGN KEY (graded_by) REFERENCES staff(id)
// );

// -- Exams table
// CREATE TABLE IF NOT EXISTS exams (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     course_id INT,
//     title VARCHAR(200) NOT NULL,
//     description TEXT,
//     exam_type ENUM('Test', 'Exam') DEFAULT 'Test',
//     duration_minutes INT NOT NULL,
//     total_questions INT NOT NULL,
//     scheduled_date DATETIME,
//     is_active BOOLEAN DEFAULT FALSE,
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     FOREIGN KEY (course_id) REFERENCES courses(id)
// );

// -- Questions table
// CREATE TABLE IF NOT EXISTS questions (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     exam_id INT,
//     question_text TEXT NOT NULL,
//     option_a VARCHAR(255) NOT NULL,
//     option_b VARCHAR(255) NOT NULL,
//     option_c VARCHAR(255) NOT NULL,
//     option_d VARCHAR(255) NOT NULL,
//     correct_answer ENUM('A', 'B', 'C', 'D') NOT NULL,
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     FOREIGN KEY (exam_id) REFERENCES exams(id)
// );

// -- Exam results table
// CREATE TABLE IF NOT EXISTS exam_results (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     exam_id INT,
//     student_id INT,
//     score INT NOT NULL,
//     total_questions INT NOT NULL,
//     time_taken_minutes INT,
//     completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     FOREIGN KEY (exam_id) REFERENCES exams(id),
//     FOREIGN KEY (student_id) REFERENCES students(id)
// );

// -- Student answers table
// CREATE TABLE IF NOT EXISTS student_answers (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     exam_result_id INT,
//     question_id INT,
//     selected_answer ENUM('A', 'B', 'C', 'D'),
//     is_correct BOOLEAN,
//     FOREIGN KEY (exam_result_id) REFERENCES exam_results(id),
//     FOREIGN KEY (question_id) REFERENCES questions(id)
// );

// -- Resources table (for handouts and lecture materials)
// CREATE TABLE IF NOT EXISTS resources (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     course_id INT,
//     staff_id INT,
//     title VARCHAR(200) NOT NULL,
//     description TEXT,
//     file_path VARCHAR(255) NOT NULL,
//     file_type VARCHAR(50),
//     uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     FOREIGN KEY (course_id) REFERENCES courses(id),
//     FOREIGN KEY (staff_id) REFERENCES staff(id)
// );

// -- Qualifications table (for student uploaded documents)
// CREATE TABLE IF NOT EXISTS qualifications (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     student_id INT,
//     qualification_name VARCHAR(100) NOT NULL,
//     file_path VARCHAR(255) NOT NULL,
//     is_highest BOOLEAN DEFAULT FALSE,
//     uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     FOREIGN KEY (student_id) REFERENCES students(id)
// );
// -- Insert initial courses
// INSERT INTO courses (name, abbreviation, duration, schedule, certification_type, description) VALUES
// ('Web Development Frontend', 'WDF', '6 months', 'weekend', 'Diploma', 'Learn HTML, CSS, JavaScript, and modern frontend frameworks'),
// ('Web Development Backend', 'WDB', '6 months', 'weekend', 'Diploma', 'Learn server-side programming, databases, and APIs'),
// ('AI Starter Kit', 'AI', '8 weeks', 'weekend', 'Certificate', 'Introduction to Artificial Intelligence and Machine Learning'),
// ('AutoCAD', 'CAD', '16 weeks', 'morning,evening', 'Diploma', 'Computer-Aided Design software training'),
// ('Solar Installation', 'SOL', '12 weeks', 'morning,evening', 'Diploma', 'Solar panel installation and maintenance'),
// ('Computer Appreciation', 'CA', '8 weeks', 'morning,evening', 'Certificate', 'Basic computer applications and skills'),
// ('Forex Trading', 'FX', '10 weeks', 'morning,evening', 'Diploma', 'Foreign exchange trading fundamentals'),
// ('Cybersecurity', 'CYB', '16 weeks', 'morning,evening', 'Diploma', 'Information security and ethical hacking'),
// ('Cryptocurrency', 'CRY', '8 weeks', 'morning,evening', 'Diploma', 'Digital currency and blockchain technology');

// -- Insert default admin
// INSERT INTO admins (username, password_hash, role, first_name, last_name) VALUES
// ('Admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin', 'System', 'Administrator');

// -- Insert sample staff (emails that can be used for signup)
// INSERT INTO staff (staff_id, first_name, last_name, email, phone) VALUES
// ('STAFF001', 'John', 'Doe', 'john.doe@ultratechglobalsolution.com.ng', '08012345678'),
// ('STAFF002', 'Jane', 'Smith', 'jane.smith@ultratechglobalsolution.com.ng', '08087654321'),
// ('STAFF003', 'Mike', 'Johnson', 'mike.johnson@ultratechglobalsolution.com.ng', '08098765432');

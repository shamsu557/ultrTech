const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const mysql = require('mysql');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// MySQL connection details
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'mysql-shamsu557.alwaysdata.net',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'shamsu557',
    password: process.env.DB_PASSWORD || '@Shamsu1440',
    database: process.env.DB_NAME || 'shamsu557_ultra_tech_dbase'
});

db.connect((err) => {
    if (err) {
        console.error('Database connection error:', err);
        throw err;
    }
    console.log('Connected to MySQL database');
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = "uploads/";
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
    fileFilter: (req, file, cb) => {
        if (!file || !file.originalname) {
            return cb(new Error("No file uploaded or file name missing"));
        }

        const allowedTypes = /jpeg|jpg|png|jfif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error("Invalid file type. Only JPG, JPEG, PNG, or JFIF are allowed."));
        }
    },
});

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Middleware
app.use(express.static(path.join(__dirname)));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));
app.use(cors());

// Middleware to check if staff is authenticated
const isAuthenticatedStaff = (req, res, next) => {
    if (req.session.staffDatabaseId) {
        return next();
    }
    res.redirect('/staff/login');
};

// --- ROUTES ---

// Homepage
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Student routes
app.get("/student/apply", (req, res) => {
    res.sendFile(path.join(__dirname, "student_signup.html"));
});

app.get("/student/register", (req, res) => {
    res.sendFile(path.join(__dirname, "register.html"));
});

app.get("/student/login", (req, res) => {
    res.sendFile(path.join(__dirname, "student_login.html"));
});

app.get('/student/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'student_dashboard.html'));
});

// Staff routes
app.get("/staff-signup", (req, res) => {
    res.sendFile(path.join(__dirname, "staff_signup.html"));
});

app.get("/staff/login", (req, res) => {
    res.sendFile(path.join(__dirname, "staff_login.html"));
});

app.get("/staff/dashboard", isAuthenticatedStaff, (req, res) => {
    res.sendFile(path.join(__dirname, "staff_dashboard.html"));
});

// Admin routes
app.get("/admin/login", (req, res) => {
    res.sendFile(path.join(__dirname, "admin_login.html"));
});

app.get("/admin/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "admin_dashboard.html"));
});

// --- API ENDPOINTS ---

// API to get course progress report data
app.get('/api/reports/course-progress', isAuthenticatedStaff, async (req, res) => {
    const staffId = req.session.staffDatabaseId;
    try {
        const query = `
            SELECT
                c.name AS courseName,
                AVG(sub.score) AS averageScore,
                COUNT(DISTINCT sub.student_id) AS studentCount,
                COUNT(sub.id) AS submissionCount
            FROM courses c
            JOIN staff_courses sc ON c.id = sc.course_id
            LEFT JOIN assignments a ON c.id = a.course_id
            LEFT JOIN assignment_submissions sub ON a.id = sub.assignment_id
            WHERE sc.staff_id = ?
            GROUP BY c.id
            ORDER BY c.name
        `;
        db.query(query, [staffId], (err, results) => {
            if (err) {
                console.error('Error fetching course progress data:', err);
                return res.status(500).json({ error: 'Failed to fetch course progress data.' });
            }
            res.json(results);
        });
    } catch (error) {
        console.error('Error fetching course progress data:', error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});

// API to get a list of courses a staff member is attached to
app.get('/api/courses', isAuthenticatedStaff, (req, res) => {
    const staffId = req.session.staffDatabaseId;
    const query = `
        SELECT c.id, c.name
        FROM courses c
        JOIN staff_courses sc ON c.id = sc.course_id
        WHERE sc.staff_id = ?
        ORDER BY c.name
    `;
    db.query(query, [staffId], (err, results) => {
        if (err) {
            console.error("Error fetching courses:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});

// API to get a list of all positions
app.get('/api/positions', (req, res) => {
    const query = 'SELECT id, name FROM positions';
    db.query(query, (err, results) => {
        if (err) {
            console.error("Error fetching positions:", err);
            return res.status(500).json({ success: false, error: 'Failed to retrieve positions.' });
        }
        res.json({ success: true, positions: results });
    });
});

// Staff signup API endpoint
app.post("/api/staff/signup", upload.single('profilePicture'), async (req, res) => {
    let { firstName, lastName, email, phone, qualifications, password, securityQuestion, securityAnswer, courseIds, positionIds } = req.body;
    const profilePicturePath = req.file ? req.file.path : null;

    if (!firstName || !lastName || !email || !phone || !qualifications || !password || !securityQuestion || !securityAnswer || !courseIds || courseIds.length === 0 || !positionIds || positionIds.length === 0) {
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        }
        return res.status(400).json({ success: false, error: "All required fields must be provided, including security question, security answer, at least one course and position." });
    }

    try {
        const checkEmailQuery = 'SELECT id, staff_id, is_registered FROM staff WHERE email = ?';
        db.query(checkEmailQuery, [email], async (err, results) => {
            if (err) {
                console.error("Database check error:", err);
                return res.status(500).json({ success: false, error: "An unexpected database error occurred." });
            }

            if (results.length === 0) {
                if (req.file) {
                    fs.unlink(req.file.path, (err) => {
                        if (err) console.error('Error deleting file:', err);
                    });
                }
                return res.status(401).json({ success: false, error: "Your email is not authorized for staff signup. Please contact an administrator." });
            }

            const staffRecord = results[0];
            if (staffRecord.is_registered) {
                if (req.file) {
                    fs.unlink(req.file.path, (err) => {
                        if (err) console.error('Error deleting file:', err);
                    });
                }
                return res.status(409).json({ success: false, error: "This email is already registered. Please login." });
            }
            
            const hashedPassword = await bcrypt.hash(password, 10);
            const normalizedSecurityAnswer = securityAnswer.trim().toUpperCase();

            const updateStaffQuery = `
                UPDATE staff
                SET first_name = ?, last_name = ?, phone = ?, qualifications = ?, password_hash = ?, security_question = ?, security_answer = ?, is_registered = TRUE, profile_picture = ?
                WHERE email = ?;
            `;
            const updateStaffValues = [firstName, lastName, phone, qualifications, hashedPassword, securityQuestion, normalizedSecurityAnswer, profilePicturePath, email];

            db.query(updateStaffQuery, updateStaffValues, (err, updateResult) => {
                if (err) {
                    console.error("Error updating staff account:", err);
                    if (req.file) {
                        fs.unlink(req.file.path, (err) => {
                            if (err) console.error('Error deleting file:', err);
                        });
                    }
                    return res.status(500).json({ success: false, error: "Failed to create account. Please try again." });
                }

                if (updateResult.affectedRows === 0) {
                    if (req.file) {
                        fs.unlink(req.file.path, (err) => {
                            if (err) console.error('Error deleting file:', err);
                        });
                    }
                    return res.status(404).json({ success: false, error: "Could not find a matching staff record to update." });
                }

                const staffId = staffRecord.id;

                const staffCoursesValues = (Array.isArray(courseIds) ? courseIds : [courseIds]).map(course_id => [staffId, course_id]);
                const insertStaffCoursesQuery = 'INSERT INTO staff_courses (staff_id, course_id) VALUES ?';
                const staffPositionsValues = (Array.isArray(positionIds) ? positionIds : [positionIds]).map(position_id => [staffId, position_id]);
                const insertStaffPositionsQuery = 'INSERT INTO staff_positions (staff_id, position_id) VALUES ?';

                db.query(insertStaffCoursesQuery, [staffCoursesValues], (err) => {
                    if (err) {
                        console.error("Error inserting into staff_courses:", err);
                    }
                });

                db.query(insertStaffPositionsQuery, [staffPositionsValues], (err) => {
                    if (err) {
                        console.error("Error inserting into staff_positions:", err);
                    }
                });

                console.log(`Staff account for ${email} registered successfully.`);
                res.status(201).json({ success: true, message: `Account created successfully. Your Staff ID is: ${staffRecord.staff_id}` });
            });
        });
    } catch (error) {
        console.error("Staff signup error:", error);
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        }
        res.status(500).json({ success: false, error: "An unexpected server error occurred." });
    }
});

// Staff login API endpoint
app.post("/api/staff/login", (req, res) => {
    const { loginId, password } = req.body;

    if (!loginId || !password) {
        return res.status(400).json({ success: false, error: "Staff ID or Email and password are required." });
    }

    let query;
    let queryValue;

    if (loginId.includes('@')) {
        query = 'SELECT id, staff_id, password_hash, is_registered FROM staff WHERE email = ?';
        queryValue = loginId;
    } else {
        query = 'SELECT id, staff_id, password_hash, is_registered FROM staff WHERE staff_id = ?';
        queryValue = loginId;
    }

    db.query(query, [queryValue], async (err, results) => {
        if (err) {
            console.error("Login database query error:", err);
            return res.status(500).json({ success: false, error: "An unexpected server error occurred." });
        }

        const staff = results[0];

        if (!staff) {
            return res.status(401).json({ success: false, error: "Invalid credentials." });
        }

        if (!staff.is_registered) {
            return res.status(401).json({ success: false, error: "Account is not yet active. Please complete the registration process." });
        }

        try {
            const passwordMatch = await bcrypt.compare(password, staff.password_hash);
            
            if (passwordMatch) {
                req.session.staffId = staff.staff_id;
                req.session.staffDatabaseId = staff.id;
                return res.status(200).json({ success: true, message: "Login successful.", staffId: staff.staff_id });
            } else {
                return res.status(401).json({ success: false, error: "Invalid credentials." });
            }
        } catch (bcryptError) {
            console.error("Bcrypt comparison error:", bcryptError);
            return res.status(500).json({ success: false, error: "An unexpected error occurred during login." });
        }
    });
});

// Staff logout API endpoint
app.post("/api/staff/logout", isAuthenticatedStaff, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error logging out:", err);
            return res.status(500).json({ success: false, error: "Failed to log out." });
        }
        res.json({ success: true, message: "Logout successful." });
    });
});

// API to get security question based on email or staff ID
app.post("/api/staff/forgot-password/get-question", (req, res) => {
    const { identifier } = req.body;

    if (!identifier) {
        return res.status(400).json({ success: false, error: "Email or Staff ID is required." });
    }

    let query;
    let queryValue;

    if (identifier.includes('@')) {
        query = 'SELECT security_question FROM staff WHERE email = ?';
        queryValue = identifier;
    } else {
        query = 'SELECT security_question FROM staff WHERE staff_id = ?';
        queryValue = identifier;
    }

    db.query(query, [queryValue], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ success: false, error: "An unexpected server error occurred." });
        }

        if (results.length === 0 || !results[0].security_question) {
            return res.status(404).json({ success: false, error: "No account found or no security question is set for this identifier." });
        }
        
        const securityQuestion = results[0].security_question;
        res.json({ success: true, securityQuestion });
    });
});

// API to reset password based on security answer
app.post("/api/staff/forgot-password/reset", async (req, res) => {
    const { identifier, securityAnswer, newPassword } = req.body;

    if (!identifier || !securityAnswer || !newPassword) {
        return res.status(400).json({ success: false, error: "All fields are required." });
    }
    
    let query;
    let queryValue;

    if (identifier.includes('@')) {
        query = 'SELECT staff_id, security_answer FROM staff WHERE email = ?';
        queryValue = identifier;
    } else {
        query = 'SELECT staff_id, security_answer FROM staff WHERE staff_id = ?';
        queryValue = identifier;
    }
    
    db.query(query, [queryValue], async (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ success: false, error: "An unexpected server error occurred." });
        }

        if (results.length === 0) {
            return res.status(404).json({ success: false, error: "Account not found." });
        }

        const staff = results[0];
        try {
            const normalizedProvidedAnswer = securityAnswer.trim().toUpperCase();
            const isMatch = (normalizedProvidedAnswer === staff.security_answer);
            
            if (isMatch) {
                const newHashedPassword = await bcrypt.hash(newPassword, 10);
                const updateQuery = 'UPDATE staff SET password_hash = ? WHERE staff_id = ?';
                db.query(updateQuery, [newHashedPassword, staff.staff_id], (updateErr) => {
                    if (updateErr) {
                        console.error("Password reset update error:", updateErr);
                        return res.status(500).json({ success: false, error: "Failed to reset password. Please try again." });
                    }
                    res.json({ success: true, message: "Password has been reset successfully." });
                });
            } else {
                res.status(401).json({ success: false, error: "Incorrect security answer." });
            }
        } catch (bcryptError) {
            console.error("Error during password reset logic:", bcryptError);
            res.status(500).json({ success: false, error: "An unexpected server error occurred." });
        }
    });
});

// API to change password
app.post('/api/settings/change-password', isAuthenticatedStaff, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const staffId = req.session.staffDatabaseId;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new passwords are required.' });
    }

    try {
        const query = 'SELECT password_hash FROM staff WHERE id = ?';
        db.query(query, [staffId], async (err, results) => {
            if (err) {
                console.error('Error fetching staff password:', err);
                return res.status(500).json({ error: 'Failed to change password.' });
            }
            if (results.length === 0) {
                return res.status(404).json({ error: 'Staff not found.' });
            }

            const staff = results[0];
            const passwordMatch = await bcrypt.compare(currentPassword, staff.password_hash);
            if (!passwordMatch) {
                return res.status(401).json({ error: 'Current password is incorrect.' });
            }

            const newHashedPassword = await bcrypt.hash(newPassword, 10);
            const updateQuery = 'UPDATE staff SET password_hash = ? WHERE id = ?';
            db.query(updateQuery, [newHashedPassword, staffId], (updateErr) => {
                if (updateErr) {
                    console.error('Error updating password:', updateErr);
                    return res.status(500).json({ error: 'Failed to change password.' });
                }
                res.json({ message: 'Password changed successfully.' });
            });
        });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});

// API to update profile picture
app.post('/api/settings/update-profile-picture', isAuthenticatedStaff, upload.single('profilePicture'), async (req, res) => {
    const staffId = req.session.staffDatabaseId;
    const profilePicturePath = req.file ? req.file.path : null;

    if (!profilePicturePath) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    try {
        // Fetch current profile picture to delete it
        const query = 'SELECT profile_picture FROM staff WHERE id = ?';
        db.query(query, [staffId], (err, results) => {
            if (err) {
                console.error('Error fetching current profile picture:', err);
                fs.unlink(req.file.path, (err) => {
                    if (err) console.error('Error deleting uploaded file:', err);
                });
                return res.status(500).json({ error: 'Failed to update profile picture.' });
            }

            const oldPicturePath = results[0]?.profile_picture;

            // Update profile picture path
            const updateQuery = 'UPDATE staff SET profile_picture = ? WHERE id = ?';
            db.query(updateQuery, [profilePicturePath, staffId], (updateErr) => {
                if (updateErr) {
                    console.error('Error updating profile picture:', updateErr);
                    fs.unlink(req.file.path, (err) => {
                        if (err) console.error('Error deleting uploaded file:', err);
                    });
                    return res.status(500).json({ error: 'Failed to update profile picture.' });
                }

                // Delete old profile picture if it exists
                if (oldPicturePath && fs.existsSync(oldPicturePath)) {
                    fs.unlink(oldPicturePath, (err) => {
                        if (err) console.error('Error deleting old profile picture:', err);
                    });
                }

                res.json({ message: 'Profile picture updated successfully.', profilePic: `/${profilePicturePath.replace(/\\/g, '/')}` });
            });
        });
    } catch (error) {
        console.error('Error updating profile picture:', error);
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting uploaded file:', err);
            });
        }
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});

// API to get staff profile information
app.get('/api/staff/me', isAuthenticatedStaff, (req, res) => {
    const staffId = req.session.staffDatabaseId;
    const staffProfileQuery = `
        SELECT
            s.staff_id AS id,
            s.first_name,
            s.last_name,
            s.profile_picture,
            s.qualifications,
            GROUP_CONCAT(DISTINCT p.name) AS positions,
            GROUP_CONCAT(DISTINCT c.name) AS courses
        FROM staff s
        LEFT JOIN staff_positions sp ON s.id = sp.staff_id
        LEFT JOIN positions p ON sp.position_id = p.id
        LEFT JOIN staff_courses sc ON s.id = sc.staff_id
        LEFT JOIN courses c ON sc.course_id = c.id
        WHERE s.id = ?
        GROUP BY s.id
    `;

    db.query(staffProfileQuery, [staffId], (err, results) => {
        if (err) {
            console.error('Error fetching staff profile:', err);
            return res.status(500).json({ error: 'Failed to fetch profile data.' });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Staff profile not found.' });
        }
        const staffProfile = results[0];
        staffProfile.profilePic = staffProfile.profile_picture
            ? `/${staffProfile.profile_picture.replace(/\\/g, '/')}`
            : 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png';
        staffProfile.courses = staffProfile.courses ? staffProfile.courses.split(',') : [];
        staffProfile.positions = staffProfile.positions ? staffProfile.positions.split(',') : [];
        res.json(staffProfile);
    });
});

// API to get dashboard statistics
app.get('/api/dashboard/stats', isAuthenticatedStaff, async (req, res) => {
    const staffId = req.session.staffDatabaseId;
    try {
        const studentCountByCourseQuery = `
            SELECT
                c.name AS courseName,
                COUNT(s.id) AS studentCount
            FROM courses c
            JOIN staff_courses sc ON c.id = sc.course_id
            LEFT JOIN students s ON c.id = s.course_id
            WHERE sc.staff_id = ?
            GROUP BY c.id
            ORDER BY c.name
        `;
        const activeAssignmentsQuery = `
            SELECT COUNT(a.id) AS activeAssignments
            FROM assignments a
            JOIN staff_courses sc ON a.course_id = sc.course_id
            WHERE a.due_date >= NOW() AND sc.staff_id = ?
        `;
        const pendingSubmissionsQuery = `
            SELECT COUNT(sub.id) AS pendingSubmissions
            FROM assignment_submissions sub
            JOIN assignments a ON sub.assignment_id = a.id
            JOIN staff_courses sc ON a.course_id = sc.course_id
            WHERE sub.score IS NULL AND sc.staff_id = ?
        `;
        const upcomingExamsQuery = `
            SELECT COUNT(e.id) AS upcomingExams
            FROM exams e
            JOIN staff_courses sc ON e.course_id = sc.course_id
            WHERE e.scheduled_date >= NOW() AND sc.staff_id = ?
        `;

        const [studentCountsResult, activeAssignmentsResult, pendingSubmissionsResult, upcomingExamsResult] = await Promise.all([
            new Promise((resolve, reject) => db.query(studentCountByCourseQuery, [staffId], (err, result) => err ? reject(err) : resolve(result))),
            new Promise((resolve, reject) => db.query(activeAssignmentsQuery, [staffId], (err, result) => err ? reject(err) : resolve(result))),
            new Promise((resolve, reject) => db.query(pendingSubmissionsQuery, [staffId], (err, result) => err ? reject(err) : resolve(result))),
            new Promise((resolve, reject) => db.query(upcomingExamsQuery, [staffId], (err, result) => err ? reject(err) : resolve(result)))
        ]);

        const totalStudents = studentCountsResult.reduce((sum, course) => sum + course.studentCount, 0);

        res.json({
            totalStudents: totalStudents,
            studentCounts: studentCountsResult,
            activeAssignments: activeAssignmentsResult[0].activeAssignments,
            pendingSubmissions: pendingSubmissionsResult[0].pendingSubmissions,
            upcomingExams: upcomingExamsResult[0].upcomingExams
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data.' });
    }
});

// API to get recent activities
app.get('/api/dashboard/activities', isAuthenticatedStaff, (req, res) => {
    const staffId = req.session.staffDatabaseId;
    const query = `
        (SELECT
            CONCAT('A new student, ', s.first_name, ' ', s.last_name, ', registered for ', c.name, '.') AS description,
            s.created_at AS event_date
        FROM students s
        JOIN courses c ON s.course_id = c.id
        JOIN staff_courses sc ON c.id = sc.course_id
        WHERE sc.staff_id = ? AND s.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY s.created_at DESC
        LIMIT 5)
        
        UNION ALL
        
        (SELECT
            CONCAT('New assignment "', a.title, '" was created for the ', c.name, ' course.') AS description,
            a.date_given AS event_date
        FROM assignments a
        JOIN courses c ON a.course_id = c.id
        JOIN staff_courses sc ON c.id = sc.course_id
        WHERE sc.staff_id = ? AND a.date_given >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY a.date_given DESC
        LIMIT 5)

        UNION ALL

        (SELECT
            CONCAT('Student ', s.first_name, ' ', s.last_name, ' submitted "', a.title, '" for marking.') AS description,
            sub.submission_date AS event_date
        FROM assignment_submissions sub
        JOIN assignments a ON sub.assignment_id = a.id
        JOIN students s ON sub.student_id = s.id
        JOIN staff_courses sc ON a.course_id = sc.course_id
        WHERE sub.score IS NULL AND sc.staff_id = ? AND sub.submission_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY sub.submission_date DESC
        LIMIT 5)

        ORDER BY event_date DESC
        LIMIT 10;
    `;

    db.query(query, [staffId, staffId, staffId], (err, results) => {
        if (err) {
            console.error('Error fetching recent activities:', err);
            return res.status(500).json({ error: 'Failed to fetch recent activities.' });
        }
        res.json(results);
    });
});

// API to get students associated with staff's courses
app.get('/api/students', isAuthenticatedStaff, (req, res) => {
    const staffId = req.session.staffDatabaseId;
    const query = `
        SELECT
            s.id,
            s.admission_number AS studentId,
            CONCAT(s.first_name, ' ', s.last_name) AS name,
            s.email,
            c.name AS course,
            s.status
        FROM students s
        JOIN staff_courses sc ON s.course_id = sc.course_id
        JOIN courses c ON s.course_id = c.id
        WHERE sc.staff_id = ?
        ORDER BY s.first_name ASC`;
    
    db.query(query, [staffId], (err, results) => {
        if (err) {
            console.error('Error fetching students:', err);
            return res.status(500).json({ error: 'Failed to fetch students data.' });
        }
        res.json(results);
    });
});

// API to get assignments associated with staff's courses
app.get('/api/assignments', isAuthenticatedStaff, (req, res) => {
    const staffId = req.session.staffDatabaseId;
    const query = `
        SELECT
            a.id,
            a.title,
            c.name AS course,
            a.due_date AS dueDate,
            a.max_score AS maxScore,
            (SELECT COUNT(*) FROM assignment_submissions sub WHERE sub.assignment_id = a.id) AS submissions
        FROM assignments a
        JOIN staff_courses sc ON a.course_id = sc.course_id
        JOIN courses c ON a.course_id = c.id
        WHERE sc.staff_id = ?
        ORDER BY a.due_date DESC
    `;

    db.query(query, [staffId], (err, results) => {
        if (err) {
            console.error('Error fetching assignments:', err);
            return res.status(500).json({ error: 'Failed to fetch assignments data.' });
        }
        res.json(results);
    });
});

// API to create a new assignment
app.post('/api/assignments', isAuthenticatedStaff, (req, res) => {
    const { title, course_id, description, instructions, date_given, due_date, max_score } = req.body;
    const staffId = req.session.staffDatabaseId;

    if (!title || !course_id || !instructions || !due_date || !max_score) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    const insertQuery = `
        INSERT INTO assignments (course_id, staff_id, title, description, instructions, date_given, due_date, max_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [course_id, staffId, title, description, instructions, date_given, due_date, max_score];
    
    db.query(insertQuery, values, (err, result) => {
        if (err) {
            console.error('Error inserting new assignment:', err);
            return res.status(500).json({ error: 'Failed to create assignment.' });
        }
        res.status(201).json({ message: 'Assignment created successfully.', assignmentId: result.insertId });
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
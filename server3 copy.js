const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./mysql');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/profiles/';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Middleware
app.use(express.static(path.join(__dirname)));
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === ROUTES ===

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

app.get("/staff/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "staff_dashboard.html"));
});

// Admin routes
app.get("/admin/login", (req, res) => {
    res.sendFile(path.join(__dirname, "admin_login.html"));
});

app.get("/admin/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "admin_dashboard.html"));
});

// === API ENDPOINTS ===

// API to get a list of all courses for the frontend dropdown
app.get('/api/courses', (req, res) => {
    const query = 'SELECT id, name FROM courses ORDER BY name';
    db.query(query, (err, results) => {
        if (err) {
            console.error("Error fetching courses:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});

// API to get a list of all positions for the frontend dropdown
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

// Staff signup API endpoint with file upload support
app.post("/api/staff/signup", upload.single('profilePicture'), async (req, res) => {
    const { firstName, lastName, email, phone, qualifications, password, courseIds, positionIds } = req.body;
    const profilePicturePath = req.file ? req.file.path : null;

    if (!firstName || !lastName || !email || !phone || !qualifications || !password || !courseIds || courseIds.length === 0 || !positionIds || positionIds.length === 0) {
        return res.status(400).json({ success: false, error: "All required fields must be provided, including at least one course and position." });
    }

    try {
        const checkEmailQuery = 'SELECT id, is_registered FROM staff WHERE email = ?';
        db.query(checkEmailQuery, [email], async (err, results) => {
            if (err) {
                console.error("Database check error:", err);
                return res.status(500).json({ success: false, error: "An unexpected database error occurred." });
            }

            if (results.length === 0) {
                return res.status(401).json({ success: false, error: "Your email is not authorized for staff signup. Please contact an administrator." });
            }

            const staffRecord = results[0];
            if (staffRecord.is_registered) {
                return res.status(409).json({ success: false, error: "This email is already registered. Please login." });
            }
            
            const hashedPassword = await bcrypt.hash(password, 10);

            // Updated query to include profile_picture
            const updateStaffQuery = `
                UPDATE staff
                SET first_name = ?, last_name = ?, phone = ?, qualifications = ?, password_hash = ?, is_registered = TRUE, profile_picture = ?
                WHERE email = ?;
            `;
            const updateStaffValues = [firstName, lastName, phone, qualifications, hashedPassword, profilePicturePath, email];

            db.query(updateStaffQuery, updateStaffValues, (err, updateResult) => {
                if (err) {
                    console.error("Error updating staff account:", err);
                    return res.status(500).json({ success: false, error: "Failed to create account. Please try again." });
                }

                if (updateResult.affectedRows === 0) {
                    return res.status(404).json({ success: false, error: "Could not find a matching staff record to update." });
                }

                const staffId = staffRecord.id;

                const staffCoursesValues = courseIds.map(course_id => [staffId, course_id]);
                const insertStaffCoursesQuery = 'INSERT INTO staff_courses (staff_id, course_id) VALUES ?';
                const staffPositionsValues = positionIds.map(position_id => [staffId, position_id]);
                const insertStaffPositionsQuery = 'INSERT INTO staff_positions (staff_id, position_id) VALUES ?';

                db.query(insertStaffCoursesQuery, [staffCoursesValues], (err) => {
                    if (err) {
                        console.error("Error inserting into staff_courses:", err);
                        return res.status(500).json({ success: false, error: "Failed to associate courses with staff member." });
                    }

                    db.query(insertStaffPositionsQuery, [staffPositionsValues], (err) => {
                        if (err) {
                            console.error("Error inserting into staff_positions:", err);
                            return res.status(500).json({ success: false, error: "Failed to associate positions with staff member." });
                        }

                        // Format the staffId here
                        const formattedStaffId = `STAFF${String(staffId).padStart(3, '0')}`;

                        console.log(`Staff account for ${email} registered successfully.`);
                        res.status(201).json({ success: true, message: `Account created successfully. Your Staff ID is: ${formattedStaffId}` });
                    });
                });
            });
        });
    } catch (error) {
        console.error("Staff signup error:", error);
        res.status(500).json({ success: false, error: "An unexpected server error occurred." });
    }
});

// Staff login API endpoint
app.post("/api/staff/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, error: "Email/Staff ID and password are required." });
    }

    let query;
    let queryValue;

    if (email.includes('@')) {
        query = 'SELECT id, email, password_hash, is_registered FROM staff WHERE email = ?';
        queryValue = email;
    } else if (email.startsWith('STAFF')) {
        const staffIdNumber = parseInt(email.substring(5), 10);
        
        if (isNaN(staffIdNumber)) {
            return res.status(401).json({ success: false, error: "Invalid Staff ID format." });
        }
        
        query = 'SELECT id, email, password_hash, is_registered FROM staff WHERE id = ?';
        queryValue = staffIdNumber;
    } else {
        return res.status(401).json({ success: false, error: "Invalid credentials." });
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
                // Return the formatted Staff ID on successful login
                const formattedStaffId = `STAFF${String(staff.id).padStart(3, '0')}`;
                return res.status(200).json({ success: true, message: "Login successful.", staffId: formattedStaffId });
            } else {
                return res.status(401).json({ success: false, error: "Invalid credentials." });
            }
        } catch (bcryptError) {
            console.error("Bcrypt comparison error:", bcryptError);
            return res.status(500).json({ success: false, error: "An unexpected error occurred during login." });
        }
    });
});
// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
const express = require("express");
const mysql = require("mysql");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const app = express();
const PORT = process.env.PORT || 3000;

// MySQL connection
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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "Uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|zip|rar|jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, Word, ZIP, RAR, JPEG, JPG, and PNG are allowed.'));
    }
  }
});

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.studentId) {
    console.log('Authenticated request:', { studentId: req.session.studentId, url: req.url });
    next();
  } else {
    console.error('Authentication failed: No studentId in session', { url: req.url });
    res.redirect("/student/login");
  }
};

// Normalize profile picture path
function normalizeProfilePath(picturePath) {
  if (!picturePath) return null;
  const normalizedPath = picturePath.replace(/\\/g, "/");
  return normalizedPath.startsWith('/uploads') ? normalizedPath : `/uploads/${path.basename(normalizedPath)}`;
}

// Input validation for login
const validateInput = (admissionNumber) => {
  const admissionRegex = /^[A-Z0-9/]{6,17}$/;
  return admissionRegex.test(admissionNumber);
};

// Routes
app.get("/student/login", (req, res) => {
  res.sendFile(path.join(__dirname, "student_login.html"));
});

// Student login
app.post('/api/student/login', async (req, res) => {
  const { admissionNumber, password } = req.body;

  if (!admissionNumber || !password) {
    console.error('Login error: Missing fields', { admissionNumber, password });
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  if (!validateInput(admissionNumber)) {
    console.error('Login error: Invalid admission number format', { admissionNumber });
    return res.status(400).json({ success: false, message: 'Invalid Admission Number or Password' });
  }

  db.query('SELECT * FROM students WHERE admission_number = ?', [admissionNumber], async (err, results) => {
    if (err) {
      console.error('Login database error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }

    if (!results || results.length === 0) {
      console.error('Login error: Student not found', { admissionNumber });
      return res.status(401).json({ success: false, message: 'Invalid Admission Number or Password' });
    }

    const student = results[0];
    try {
      const validPassword = await bcrypt.compare(password, student.password_hash);
      if (!validPassword) {
        console.error('Login error: Invalid password', { admissionNumber });
        return res.status(401).json({ success: false, message: 'Invalid Admission Number or Password' });
      }

      req.session.studentId = student.id;
      req.session.student = {
        id: student.id,
        admissionNumber: student.admission_number,
        name: `${student.first_name} ${student.last_name}`,
        email: student.email,
        course_id: student.course_id
      };

      console.log('Login successful:', { studentId: student.id, admissionNumber });
      res.json({
        success: true,
        message: 'Login successful',
        redirect: '/student/dashboard'
      });
    } catch (error) {
      console.error('Password comparison error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });
});

// Student dashboard route
app.get('/student/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'student_dashboard.html'));
});

// Student profile endpoint (Read-only)
app.get("/api/student/profile", isAuthenticated, (req, res) => {
  const query = `
    SELECT s.id, s.first_name, s.last_name, s.email, s.phone, s.address, s.profile_picture, s.admission_number,
           c.name AS course_name 
    FROM students s 
    LEFT JOIN courses c ON s.course_id = c.id 
    WHERE s.id = ?
  `;

  db.query(query, [req.session.studentId], (err, results) => {
    if (err) {
      console.error("Profile fetch error:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }

    if (results.length === 0) {
      console.error("Profile error: Student not found", { studentId: req.session.studentId });
      return res.status(404).json({ success: false, error: "Student not found" });
    }

    const student = results[0];
    student.profile_picture = normalizeProfilePath(student.profile_picture);
    console.log('Profile fetched:', { studentId: student.id, profile_picture: student.profile_picture });

    res.json({ success: true, student });
  });
});

// Overview data endpoint
app.get("/api/student-overview", isAuthenticated, (req, res) => {
  const studentId = req.session.studentId;

  const queries = [
    `SELECT 
       COUNT(*) as totalAssignments,
       COUNT(sub.id) as completedAssignments
     FROM assignments a
     LEFT JOIN students s ON s.course_id = a.course_id
     LEFT JOIN assignment_submissions sub ON a.id = sub.assignment_id AND sub.student_id = s.id
     WHERE s.id = ?`,
    `SELECT 
       AVG(CASE WHEN sub.score IS NOT NULL THEN (sub.score / a.max_score) * 100 END) as assignmentAverage,
       (SELECT AVG((score / total_questions) * 100) FROM exam_results WHERE student_id = ?) as examAverage
     FROM assignments a
     LEFT JOIN students s ON s.course_id = a.course_id
     LEFT JOIN assignment_submissions sub ON a.id = sub.assignment_id AND sub.student_id = s.id
     WHERE s.id = ?`,
    `SELECT COUNT(*) as upcomingExams
     FROM exams e
     LEFT JOIN students s ON s.course_id = e.course_id
     WHERE s.id = ? AND e.scheduled_date > NOW() AND e.is_active = 1`,
    `SELECT 'assignment' as type, a.title, 'New assignment posted' as description, a.created_at
     FROM assignments a
     LEFT JOIN students s ON s.course_id = a.course_id
     WHERE s.id = ?
     UNION ALL
     SELECT 'payment' as type, CONCAT('Payment: ', p.payment_type) as title, 
            CONCAT('Amount: ₦', p.amount) as description, p.payment_date as created_at
     FROM payments p
     WHERE p.student_id = ?
     ORDER BY created_at DESC LIMIT 5`
  ];

  Promise.all([
    new Promise((resolve, reject) => {
      db.query(queries[0], [studentId], (err, results) => {
        if (err) reject(err);
        else resolve(results[0] || { totalAssignments: 0, completedAssignments: 0 });
      });
    }),
    new Promise((resolve, reject) => {
      db.query(queries[1], [studentId, studentId], (err, results) => {
        if (err) reject(err);
        else {
          const result = results[0] || {};
          const assignmentAvg = result.assignmentAverage || 0;
          const examAvg = result.examAverage || 0;
          const overall = Math.round((assignmentAvg * 0.6 + examAvg * 0.4) * 100) / 100;
          resolve({ overallGrade: overall });
        }
      });
    }),
    new Promise((resolve, reject) => {
      db.query(queries[2], [studentId], (err, results) => {
        if (err) reject(err);
        else resolve(results[0] || { upcomingExams: 0 });
      });
    }),
    new Promise((resolve, reject) => {
      db.query(queries[3], [studentId, studentId], (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
      });
    })
  ])
    .then(([assignments, grade, exams, activities]) => {
      console.log('Overview fetched:', { studentId, stats: { assignments, grade, exams }, activities });
      res.json({
        success: true,
        stats: {
          totalAssignments: assignments.totalAssignments,
          completedAssignments: assignments.completedAssignments,
          overallGrade: grade.overallGrade,
          upcomingExams: exams.upcomingExams
        },
        recentActivities: activities
      });
    })
    .catch((err) => {
      console.error("Overview data error:", err);
      res.status(500).json({ success: false, error: "Failed to load overview data" });
    });
});

// Payments endpoint
app.get("/api/student/payments", isAuthenticated, (req, res) => {
  const studentId = req.session.studentId;

  const paymentsQuery = `
    SELECT 'Application' as payment_type, amount, reference_number, 'Completed' as status, created_at as payment_date 
    FROM students WHERE id = ? AND amount IS NOT NULL AND reference_number IS NOT NULL
    UNION ALL
    SELECT payment_type, amount, reference_number, status, payment_date
    FROM payments WHERE student_id = ?
    ORDER BY payment_date DESC
  `;

  const outstandingQuery = `SELECT 'Registration' as type, c.registration_fee - COALESCE(SUM(p.amount), 0) as amount,
                           'Complete your registration payment' as description, NULL as dueDate
                           FROM students s
                           JOIN courses c ON s.course_id = c.id
                           LEFT JOIN payments p ON p.student_id = s.id AND p.payment_type = 'Registration'
                           WHERE s.id = ? AND s.status = 'Applied'
                           GROUP BY c.registration_fee
                           HAVING amount > 0`;

  Promise.all([
    new Promise((resolve, reject) => {
      db.query(paymentsQuery, [studentId, studentId], (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
      });
    }),
    new Promise((resolve, reject) => {
      db.query(outstandingQuery, [studentId], (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
      });
    })
  ])
    .then(([payments, outstanding]) => {
      console.log('Payments fetched:', { studentId, paymentsCount: payments.length, outstandingCount: outstanding.length });
      res.json({
        success: true,
        payments,
        outstanding
      });
    })
    .catch((err) => {
      console.error("Payments data error:", err);
      res.status(500).json({ success: false, error: "Failed to load payments data" });
    });
});

// Assignments endpoint
app.get("/api/student/assignments", isAuthenticated, (req, res) => {
  const studentId = req.session.studentId;

  const query = `
    SELECT a.id, a.title, a.description, a.instructions, a.date_given, a.due_date, a.max_score,
           sub.id as submission_id, sub.file_path as submission_file, sub.submission_date, sub.score, sub.feedback
    FROM assignments a
    LEFT JOIN students s ON s.course_id = a.course_id
    LEFT JOIN assignment_submissions sub ON a.id = sub.assignment_id AND sub.student_id = s.id
    WHERE s.id = ?
    ORDER BY a.due_date DESC
  `;

  db.query(query, [studentId], (err, results) => {
    if (err) {
      console.error("Assignments error:", err);
      return res.status(500).json({ success: false, error: "Failed to load assignments" });
    }

    const assignments = results.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      instructions: row.instructions,
      date_given: row.date_given,
      due_date: row.due_date,
      max_score: row.max_score,
      submission: row.submission_id ? {
        id: row.submission_id,
        file_path: normalizeProfilePath(row.submission_file),
        submission_date: row.submission_date,
        score: row.score,
        feedback: row.feedback
      } : null
    }));

    console.log('Assignments fetched:', { studentId, assignmentCount: assignments.length });
    res.json({ success: true, assignments });
  });
});

// Submit assignment endpoint
app.post("/api/student/submit-assignment", isAuthenticated, upload.single("assignmentFile"), (req, res) => {
  const { assignmentId } = req.body;
  const studentId = req.session.studentId;

  if (!req.file) {
    console.error('Assignment submission error: No file uploaded', { assignmentId, studentId });
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  const filePath = `/uploads/${req.file.filename}`;

  const checkQuery = `SELECT id FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?`;

  db.query(checkQuery, [assignmentId, studentId], (err, results) => {
    if (err) {
      console.error("Assignment submission check error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (results.length > 0) {
      const updateQuery = `
        UPDATE assignment_submissions 
        SET file_path = ?, submission_date = NOW()
        WHERE id = ?
      `;
      db.query(updateQuery, [filePath, results[0].id], (err) => {
        if (err) {
          console.error("Assignment update error:", err);
          return res.status(500).json({ success: false, message: "Update failed" });
        }
        console.log('Assignment updated:', { assignmentId, studentId, filePath });
        res.json({ success: true, message: "Submission updated successfully" });
      });
    } else {
      const insertQuery = `
        INSERT INTO assignment_submissions (assignment_id, student_id, file_path, submission_date) 
        VALUES (?, ?, ?, NOW())
      `;
      db.query(insertQuery, [assignmentId, studentId, filePath], (err) => {
        if (err) {
          console.error("Assignment insert error:", err);
          return res.status(500).json({ success: false, message: "Submission failed" });
        }
        console.log('Assignment submitted:', { assignmentId, studentId, filePath });
        res.json({ success: true, message: "Assignment submitted successfully" });
      });
    }
  });
});

// Results endpoint
app.get("/api/student/results", isAuthenticated, (req, res) => {
  const studentId = req.session.studentId;

  const query = `
    SELECT 'Assignment' as type, a.title, sub.score, a.max_score,
           ROUND((sub.score / a.max_score) * 100) as percentage, sub.graded_at as date
    FROM assignment_submissions sub
    JOIN assignments a ON sub.assignment_id = a.id
    WHERE sub.student_id = ? AND sub.score IS NOT NULL
    UNION ALL
    SELECT e.exam_type as type, e.title, er.score, er.total_questions as max_score,
           ROUND((er.score / er.total_questions) * 100) as percentage, er.completed_at as date
    FROM exam_results er
    JOIN exams e ON er.exam_id = e.id
    WHERE er.student_id = ?
    ORDER BY date DESC
  `;

  db.query(query, [studentId, studentId], (err, results) => {
    if (err) {
      console.error("Results error:", err);
      return res.status(500).json({ success: false, error: "Failed to load results" });
    }

    const assignments = results.filter(r => r.type === "Assignment");
    const tests = results.filter(r => r.type === "Test");
    const exams = results.filter(r => r.type === "Exam");

    const assignmentAverage = assignments.length > 0
      ? Math.round(assignments.reduce((sum, a) => sum + a.percentage, 0) / assignments.length)
      : 0;
    const testAverage = tests.length > 0
      ? Math.round(tests.reduce((sum, t) => sum + t.percentage, 0) / tests.length)
      : 0;
    const examAverage = exams.length > 0
      ? Math.round(exams.reduce((sum, e) => sum + e.percentage, 0) / exams.length)
      : 0;

    console.log('Results fetched:', { studentId, assignmentCount: assignments.length, testCount: tests.length, examCount: exams.length });
    res.json({
      success: true,
      results: {
        assignmentAverage,
        testAverage,
        examAverage,
        detailed: results
      }
    });
  });
});

// Progress data endpoint for the chart
app.get("/api/student/progress", isAuthenticated, (req, res) => {
  const studentId = req.session.studentId;

  const query = `
    SELECT 'Assignment' as type, a.title, sub.score, a.max_score,
           ROUND((sub.score / a.max_score) * 100) as percentage
    FROM assignment_submissions sub
    JOIN assignments a ON sub.assignment_id = a.id
    WHERE sub.student_id = ? AND sub.score IS NOT NULL
    UNION ALL
    SELECT 'Test' as type, e.title, er.score, er.total_questions as max_score,
           ROUND((er.score / er.total_questions) * 100) as percentage
    FROM exam_results er
    JOIN exams e ON er.exam_id = e.id
    WHERE er.student_id = ? AND e.exam_type = 'Test'
    UNION ALL
    SELECT 'Exam' as type, e.title, er.score, er.total_questions as max_score,
           ROUND((er.score / er.total_questions) * 100) as percentage
    FROM exam_results er
    JOIN exams e ON er.exam_id = e.id
    WHERE er.student_id = ? AND e.exam_type = 'Final'
  `;

  db.query(query, [studentId, studentId, studentId], (err, results) => {
    if (err) {
      console.error("Progress data error:", err);
      return res.status(500).json({ success: false, error: "Failed to load progress data" });
    }

    const assignments = results.filter(r => r.type === "Assignment");
    const tests = results.filter(r => r.type === "Test");
    const exams = results.filter(r => r.type === "Exam");

    const assignmentAverage = assignments.length > 0
      ? Math.round(assignments.reduce((sum, a) => sum + a.percentage, 0) / assignments.length)
      : 0;
    const testAverage = tests.length > 0
      ? Math.round(tests.reduce((sum, t) => sum + t.percentage, 0) / tests.length)
      : 0;
    const examAverage = exams.length > 0
      ? Math.round(exams.reduce((sum, e) => sum + e.percentage, 0) / exams.length)
      : 0;

    res.json({
      success: true,
      assignmentAverage,
      testAverage,
      examAverage
    });
  });
});

// Exams endpoint
app.get("/api/student/exams", isAuthenticated, (req, res) => {
  const studentId = req.session.studentId;

  const examsQuery = `
    SELECT e.id, e.title, e.description, e.exam_type, e.duration_minutes, e.total_questions, 
           e.scheduled_date, e.is_active
    FROM exams e
    LEFT JOIN students s ON s.course_id = e.course_id
    WHERE s.id = ?
    ORDER BY e.scheduled_date DESC
  `;

  const historyQuery = `
    SELECT e.title as exam_title, e.exam_type, er.score, er.total_questions, 
           er.time_taken_minutes, er.completed_at
    FROM exam_results er
    JOIN exams e ON er.exam_id = e.id
    WHERE er.student_id = ?
    ORDER BY er.completed_at DESC
  `;

  Promise.all([
    new Promise((resolve, reject) => {
      db.query(examsQuery, [studentId], (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
      });
    }),
    new Promise((resolve, reject) => {
      db.query(historyQuery, [studentId], (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
      });
    })
  ])
    .then(([exams, history]) => {
      console.log('Exams fetched:', { studentId, examCount: exams.length, historyCount: history.length });
      res.json({
        success: true,
        exams,
        history
      });
    })
    .catch((err) => {
      console.error("Exams data error:", err);
      res.status(500).json({ success: false, error: "Failed to load exams data" });
    });
});

// Resources endpoint
app.get("/api/student/resources", isAuthenticated, (req, res) => {
  const studentId = req.session.studentId;

  const query = `
    SELECT r.id, r.title, r.description, r.file_path, r.file_type, r.uploaded_at,
           CONCAT(st.first_name, ' ', st.last_name) as uploaded_by
    FROM resources r
    LEFT JOIN students s ON s.course_id = r.course_id
    LEFT JOIN staff st ON r.staff_id = st.id
    WHERE s.id = ?
    ORDER BY r.uploaded_at DESC
  `;

  db.query(query, [studentId], (err, results) => {
    if (err) {
      console.error("Resources error:", err);
      return res.status(500).json({ success: false, error: "Failed to load resources" });
    }

    const resources = results.map(row => ({
      ...row,
      file_path: normalizeProfilePath(row.file_path)
    }));

    console.log('Resources fetched:', { studentId, resourceCount: resources.length });
    res.json({ success: true, resources });
  });
});

// Logout endpoint
app.post("/api/student/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).json({ success: false, error: "Logout failed" });
    }
    console.log('Logout successful');
    res.json({
      success: true,
      message: "Logged out successfully",
      redirect: "/student/login"
    });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
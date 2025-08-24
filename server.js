const express = require("express");
const mysql = require("mysql");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require('./mysql');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const app = express();
const PORT = process.env.PORT || 3000;

const PAYSTACK_SECRET_KEY = 'sk_live_b04d777ada9b06c828dc4084969106de9d8044a3'; // Replace with your actual Paystack secret key

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the root directory
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

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "public/uploads/";
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
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|zip/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
});

// Routes

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

app.get("/student/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "student_dashboard.html"));
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

// API Routes

// Get all courses
app.get("/api/courses", (req, res) => {
  const query = "SELECT * FROM courses ORDER BY name";
  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching courses:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});

// Verify application
app.get("/api/student/verify-application/:applicationNumber", (req, res) => {
  const { applicationNumber } = req.params;

  const query = `SELECT s.*, c.name as course_name 
                 FROM students s 
                 JOIN courses c ON s.course_id = c.id 
                 WHERE s.application_number = ? AND s.status = 'Applied'`;

  db.query(query, [applicationNumber], (err, results) => {
    if (err) {
      console.error("Error verifying application:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Application not found or already processed" });
    }

    res.json({
      success: true,
      student: results[0],
    });
  });
});

// Setup security
app.post("/api/student/setup-security", async (req, res) => {
  const { studentId, password, securityQuestion, securityAnswer } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `UPDATE students 
                   SET password_hash = ?, security_question = ?, security_answer = ?
                   WHERE id = ?`;

    db.query(query, [hashedPassword, securityQuestion, securityAnswer, studentId], (err, result) => {
      if (err) {
        console.error("Error setting up security:", err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({ success: true });
    });
  } catch (error) {
    console.error("Error hashing password:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Complete registration
app.post(
  "/api/student/complete-registration",
  upload.fields([
    { name: "highestQualification", maxCount: 1 },
    { name: "additionalQualFile_0", maxCount: 1 },
    { name: "additionalQualFile_1", maxCount: 1 },
    { name: "additionalQualFile_2", maxCount: 1 },
  ]),
  async (req, res) => {
    const { studentId } = req.body;

    try {
      // Get student and course info for admission number generation
      const studentQuery = `SELECT s.*, c.abbreviation, c.certification_type 
                          FROM students s 
                          JOIN courses c ON s.course_id = c.id 
                          WHERE s.id = ?`;

      db.query(studentQuery, [studentId], (err, studentResults) => {
        if (err || studentResults.length === 0) {
          return res.status(500).json({ error: "Student not found" });
        }

        const student = studentResults[0];
        const admissionNumber = generateAdmissionNumber(
          student.abbreviation,
          student.certification_type === "Certificate" ? "CERT" : "DIP",
        );

        // Update student with admission number and status
        const updateQuery = `UPDATE students 
                           SET admission_number = ?, status = 'Registered', highest_qualification = ?
                           WHERE id = ?`;

        const highestQualPath = req.files.highestQualification ? req.files.highestQualification[0].path : null;

        db.query(updateQuery, [admissionNumber, highestQualPath, studentId], (err, result) => {
          if (err) {
            console.error("Error completing registration:", err);
            return res.status(500).json({ error: "Database error" });
          }

          // Save additional qualifications
          const qualPromises = [];
          for (let i = 0; i < 3; i++) {
            const qualName = req.body[`additionalQualName_${i}`];
            const qualFile = req.files[`additionalQualFile_${i}`];

            if (qualName && qualFile) {
              const qualQuery = `INSERT INTO qualifications (student_id, qualification_name, file_path, is_highest) 
                               VALUES (?, ?, ?, false)`;
              qualPromises.push(
                new Promise((resolve, reject) => {
                  db.query(qualQuery, [studentId, qualName, qualFile[0].path], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                  });
                }),
              );
            }
          }

          Promise.all(qualPromises)
            .then(() => {
              res.json({
                success: true,
                admissionNumber: admissionNumber,
              });
            })
            .catch((error) => {
              console.error("Error saving qualifications:", error);
              res.json({
                success: true,
                admissionNumber: admissionNumber,
                warning: "Registration complete but some qualifications failed to save",
              });
            });
        });
      });
    } catch (error) {
      console.error("Error completing registration:", error);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Student login
app.post("/api/student/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if it's application number (no password required) or admission number
    let query;
    if (!password) {
      // Application number login
      query = `SELECT * FROM students WHERE application_number = ? AND status = 'Applied'`;
    } else {
      // Admission number login
      query = `SELECT * FROM students WHERE admission_number = ? AND status IN ('Registered', 'Active')`;
    }

    db.query(query, [username], async (err, results) => {
      if (err) {
        console.error("Error during login:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (results.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const student = results[0];

      // If password provided, verify it
      if (password && student.password_hash) {
        const isValidPassword = await bcrypt.compare(password, student.password_hash);
        if (!isValidPassword) {
          return res.status(401).json({ error: "Invalid credentials" });
        }
      }

      // Create session
      req.session.studentId = student.id;
      req.session.studentType = student.status === "Applied" ? "applicant" : "registered";

      res.json({
        success: true,
        student: {
          id: student.id,
          name: `${student.first_name} ${student.last_name}`,
          status: student.status,
          applicationNumber: student.application_number,
          admissionNumber: student.admission_number,
        },
      });
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get security question
app.get("/api/student/security-question/:username", (req, res) => {
  const { username } = req.params;

  const query = `SELECT security_question FROM students WHERE admission_number = ?`;

  db.query(query, [username], (err, results) => {
    if (err) {
      console.error("Error getting security question:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.json({
      success: true,
      securityQuestion: results[0].security_question,
    });
  });
});

// Reset password
app.post("/api/student/reset-password", async (req, res) => {
  const { username, securityAnswer, newPassword } = req.body;

  try {
    // Verify security answer
    const query = `SELECT id, security_answer FROM students WHERE admission_number = ?`;

    db.query(query, [username], async (err, results) => {
      if (err) {
        console.error("Error during password reset:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: "Student not found" });
      }

      const student = results[0];

      if (student.security_answer !== securityAnswer) {
        return res.status(401).json({ error: "Incorrect security answer" });
      }

      // Hash new password and update
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const updateQuery = `UPDATE students SET password_hash = ? WHERE id = ?`;

      db.query(updateQuery, [hashedPassword, student.id], (err, result) => {
        if (err) {
          console.error("Error updating password:", err);
          return res.status(500).json({ error: "Database error" });
        }

        res.json({ success: true });
      });
    });
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Payment verification
app.post("/api/payment/verify", async (req, res) => {
  try {
    const { reference, paymentType, installmentType, studentId } = req.body;

    // Verify Paystack payment
    const transaction = await verifyPaystackPayment(reference);

    if (!transaction || transaction.status !== "success") {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    const amount = transaction.amount / 100; // Paystack returns in kobo
    const metadata = transaction.metadata || {};

    if (paymentType === "Application") {
      const applicationNumber = metadata.application_number;

      if (!metadata.course_id) {
        return res.status(400).json({ error: "Missing course_id in metadata" });
      }

      // Validate course_id exists
      const courseCheckQuery = `SELECT id FROM courses WHERE id = ? LIMIT 1`;
      db.query(courseCheckQuery, [metadata.course_id], (err, courseResults) => {
        if (err) {
          console.error("Error checking course:", err);
          return res.status(500).json({ error: "Database error: " + err.message });
        }

        if (courseResults.length === 0) {
          return res
            .status(400)
            .json({ error: `Invalid course ID: ${metadata.course_id}. Please select a valid course.` });
        }

        console.log("Received metadata:", metadata);

        // Insert into students table
       const query = `INSERT INTO students (application_number, first_name, last_name, email, phone, gender, date_of_birth, address, course_id, schedule, profile_picture, status, reference_number, amount, payment_date)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS UNSIGNED), ?, ?, 'Applied', ?, ?, NOW())`;
db.query(
    query,
    [
        applicationNumber,
        metadata.first_name,
        metadata.last_name,
        metadata.email,
        metadata.phone,
        metadata.gender,
        metadata.date_of_birth,
        metadata.address,
        metadata.course_id, // Cast to integer for safety
        metadata.schedule,
        metadata.profile_picture || null, // Handle null profile picture
        reference,
        amount,
    ],          (err, result) => {
            if (err) {
              console.error("Error creating application:", err);

              if (err.code === "ER_DUP_ENTRY") {
                return res.status(400).json({ error: "Email or application already exists" });
              }
              if (err.code === "ER_NO_REFERENCED_ROW_2") {
                return res.status(400).json({
                  error: `Course ID ${metadata.course_id} does not exist in the courses table`,
                });
              }
              return res.status(500).json({ error: `Database error: ${err.message}` });
            }

            res.json({ success: true, applicationNumber });
          }
        );
      });
    } else {
      // Handle other payment types
      const installmentNumber = installmentType === "full" ? 1 : 1;
      const totalInstallments = installmentType === "full" ? 1 : 2;

      if (!studentId) {
        return res.status(400).json({ error: "Missing studentId for payment" });
      }

      const paymentQuery = `
        INSERT INTO payments (
          student_id, payment_type, amount, reference_number,
          installment_number, total_installments, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'Completed')
      `;

      db.query(
        paymentQuery,
        [studentId, paymentType, amount, reference, installmentNumber, totalInstallments],
        (err, result) => {
          if (err) {
            console.error("Error recording payment:", err);
            return res.status(500).json({ error: "Payment recording failed: " + err.message });
          }

          res.json({ success: true });
        }
      );
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Download receipt
app.get("/api/receipt/download", (req, res) => {
  const { type, ref, appNum } = req.query;

  if (type !== "application") {
    return res.status(400).json({ error: "Invalid type. Only 'application' supported." });
  }

  const query = `
    SELECT s.*, c.name AS course_name 
    FROM students s 
    LEFT JOIN courses c ON s.course_id = c.id 
    WHERE s.application_number = ? AND s.reference_number = ?
  `;

  db.query(query, [appNum, ref], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database query failed." });
    }

    if (!results || results.length === 0) {
      return res.status(404).json({ error: "Application not found." });
    }

    const student = results[0];

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="application_form_${appNum}.pdf"`
    );
    doc.pipe(res);

    // Add logo (same folder as server.js)
    const logoPath = path.join(__dirname, "logo.png");
    try {
      doc.image(logoPath, 50, 30, { width: 100 });
    } catch (e) {
      console.warn("Logo not found:", e.message);
    }
    doc.moveDown(5);

    // Header
    doc.fontSize(22).text("UltraTech Global Solution LTD", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(12).text("Gwammaja Housing Estate, Opp. Orthopedic Hospital, Dala", { align: "center" });
    doc.text("Email: info@ultratechglobalsolution.com.ng | Phone: 08024606199, 08167030902", { align: "center" });
    doc.moveDown(2);

    // Title
    doc.fontSize(16).text("Application Form & Payment Receipt", { align: "center" });
    doc.moveDown(2);

    // Student info
    doc.fontSize(12).text(`Application Number: ${student.application_number}`);
    doc.text(`Name: ${student.first_name} ${student.last_name}`);
    doc.text(`Email: ${student.email}`);
    doc.text(`Phone: ${student.phone}`);
    doc.text(`Gender: ${student.gender}`);
    doc.text(`Date of Birth: ${student.date_of_birth}`);
    doc.text(`Address: ${student.address}`);
    doc.text(`Course: ${student.course_name || "Unknown"}`);
    doc.text(`Schedule: ${student.schedule}`);
    doc.moveDown();

    // Payment info
    const formattedAmount = new Intl.NumberFormat("en-NG").format(student.amount);
    doc.text(`Payment Amount: ₦${formattedAmount}`);
    doc.text(`Reference: ${student.reference_number}`);
    doc.text(`Payment Date: ${student.payment_date}`);
    doc.moveDown(2);

    doc.fontSize(10).text("This receipt is system-generated and valid without signature.", { align: "center" });

    doc.end();
  });
});
// Student dashboard API endpoints

// Student profile endpoint
app.get("/api/student/profile", (req, res) => {
  if (!req.session.studentId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const query = `SELECT s.*, c.name as course_name 
                 FROM students s 
                 LEFT JOIN courses c ON s.course_id = c.id 
                 WHERE s.id = ?`;

  db.query(query, [req.session.studentId], (err, results) => {
    if (err) {
      console.error("Error fetching student profile:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }

    const student = results[0];
    delete student.password_hash; // Don't send password hash
    delete student.security_answer; // Don't send security answer

    res.json({ success: true, student });
  });
});

// Student overview data
app.get("/api/student-overview", (req, res) => {
  if (!req.session.studentId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const studentId = req.session.studentId;

  // Get overview statistics
  const statsQuery = `
    SELECT 
      (SELECT COUNT(*) FROM assignments a 
       JOIN students s ON s.course_id = a.course_id 
       WHERE s.id = ?) as totalAssignments,
      (SELECT COUNT(*) FROM assignment_submissions asub 
       WHERE asub.student_id = ?) as completedAssignments,
      (SELECT COUNT(*) FROM exams e 
       JOIN students s ON s.course_id = e.course_id 
       WHERE s.id = ? AND e.scheduled_date > NOW() AND e.is_active = 1) as upcomingExams
  `;

  db.query(statsQuery, [studentId, studentId, studentId], (err, statsResults) => {
    if (err) {
      console.error("Error fetching overview stats:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const stats = statsResults[0];
    stats.overallGrade = 0; // Will be calculated based on actual results

    // Get recent activities
    const activitiesQuery = `
      SELECT 'assignment' as type, a.title, 'New assignment posted' as description, a.created_at
      FROM assignments a 
      JOIN students s ON s.course_id = a.course_id 
      WHERE s.id = ?
      UNION ALL
      SELECT 'payment' as type, CONCAT(p.payment_type, ' Payment') as title, 
             CONCAT('Payment of ₦', p.amount, ' completed') as description, p.payment_date as created_at
      FROM payments p 
      WHERE p.student_id = ?
      ORDER BY created_at DESC 
      LIMIT 10
    `;

    db.query(activitiesQuery, [studentId, studentId], (err, activitiesResults) => {
      if (err) {
        console.error("Error fetching activities:", err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        success: true,
        stats,
        recentActivities: activitiesResults,
      });
    });
  });
});

// Student payments
app.get("/api/student/payments", (req, res) => {
  if (!req.session.studentId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const paymentsQuery = `SELECT * FROM payments WHERE student_id = ? ORDER BY payment_date DESC`;

  db.query(paymentsQuery, [req.session.studentId], (err, payments) => {
    if (err) {
      console.error("Error fetching payments:", err);
      return res.status(500).json({ error: "Database error" });
    }

    // Check for outstanding payments
    const outstanding = [];

    // Check if registration payment is complete
    const registrationPayments = payments.filter((p) => p.payment_type === "Registration");
    const totalRegistrationPaid = registrationPayments.reduce((sum, p) => sum + Number.parseFloat(p.amount), 0);

    if (totalRegistrationPaid < 500) {
      outstanding.push({
        type: "Registration",
        amount: 500 - totalRegistrationPaid,
        description: "Complete your registration payment",
        dueDate: null,
      });
    }

    res.json({
      success: true,
      payments,
      outstanding,
    });
  });
});

// Student assignments
app.get("/api/student/assignments", (req, res) => {
  if (!req.session.studentId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const assignmentsQuery = `
    SELECT a.*, asub.id as submission_id, asub.file_path as submission_file, 
           asub.submission_date, asub.score, asub.feedback
    FROM assignments a
    JOIN students s ON s.course_id = a.course_id
    LEFT JOIN assignment_submissions asub ON asub.assignment_id = a.id AND asub.student_id = s.id
    WHERE s.id = ?
    ORDER BY a.date_given DESC
  `;

  db.query(assignmentsQuery, [req.session.studentId], (err, results) => {
    if (err) {
      console.error("Error fetching assignments:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const assignments = results.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      instructions: row.instructions,
      date_given: row.date_given,
      due_date: row.due_date,
      max_score: row.max_score,
      submission: row.submission_id
        ? {
            id: row.submission_id,
            file_path: row.submission_file,
            submission_date: row.submission_date,
            score: row.score,
            feedback: row.feedback,
          }
        : null,
    }));

    res.json({ success: true, assignments });
  });
});

// Submit assignment
app.post("/api/student/submit-assignment", upload.single("file"), (req, res) => {
  if (!req.session.studentId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { assignmentId, notes } = req.body;
  const filePath = req.file ? req.file.path : null;

  if (!filePath) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const query = `INSERT INTO assignment_submissions (assignment_id, student_id, file_path, submission_date) 
                 VALUES (?, ?, ?, NOW())`;

  db.query(query, [assignmentId, req.session.studentId, filePath], (err, result) => {
    if (err) {
      console.error("Error submitting assignment:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({ success: true });
  });
});

// Student results
app.get("/api/student/results", (req, res) => {
  if (!req.session.studentId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const resultsQuery = `
    SELECT 
      AVG(CASE WHEN asub.score IS NOT NULL THEN (asub.score / a.max_score) * 100 END) as assignmentAverage,
      0 as testAverage,
      0 as examAverage
    FROM assignments a
    JOIN students s ON s.course_id = a.course_id
    LEFT JOIN assignment_submissions asub ON asub.assignment_id = a.id AND asub.student_id = s.id
    WHERE s.id = ?
  `;

  db.query(resultsQuery, [req.session.studentId], (err, results) => {
    if (err) {
      console.error("Error fetching results:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const result = results[0];
    result.assignmentAverage = Math.round(result.assignmentAverage || 0);

    res.json({
      success: true,
      results: result,
      detailed: [], // Will be populated with actual assessment results
    });
  });
});

// Student exams
app.get("/api/student/exams", (req, res) => {
  if (!req.session.studentId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const examsQuery = `
    SELECT e.* FROM exams e
    JOIN students s ON s.course_id = e.course_id
    WHERE s.id = ?
    ORDER BY e.scheduled_date DESC
  `;

  const historyQuery = `
    SELECT er.*, e.title as exam_title, e.exam_type
    FROM exam_results er
    JOIN exams e ON e.id = er.exam_id
    WHERE er.student_id = ?
    ORDER BY er.completed_at DESC
  `;

  db.query(examsQuery, [req.session.studentId], (err, exams) => {
    if (err) {
      console.error("Error fetching exams:", err);
      return res.status(500).json({ error: "Database error" });
    }

    db.query(historyQuery, [req.session.studentId], (err, history) => {
      if (err) {
        console.error("Error fetching exam history:", err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        success: true,
        exams,
        history,
      });
    });
  });
});

// Update student profile
app.post("/api/student/update-profile", (req, res) => {
  if (!req.session.studentId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { phone, address } = req.body;

  const query = `UPDATE students SET phone = ?, address = ? WHERE id = ?`;

  db.query(query, [phone, address, req.session.studentId], (err, result) => {
    if (err) {
      console.error("Error updating profile:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({ success: true });
  });
});

// Update profile picture
app.post("/api/student/update-profile-picture", upload.single("profilePicture"), (req, res) => {
  if (!req.session.studentId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const profilePicturePath = req.file.path;

  const query = `UPDATE students SET profile_picture = ? WHERE id = ?`;

  db.query(query, [profilePicturePath, req.session.studentId], (err, result) => {
    if (err) {
      console.error("Error updating profile picture:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({
      success: true,
      profilePicture: profilePicturePath,
    });
  });
});

// Student logout
app.post("/api/student/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).json({ error: "Logout failed" });
    }
    res.json({ success: true });
  });
});

// Staff API endpoints

// Staff signup
app.post("/api/staff/signup", async (req, res) => {
  const { firstName, lastName, email, phone, department, position, qualifications, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `INSERT INTO staff (first_name, last_name, email, phone, department, position, qualifications, password_hash, status) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`;

    db.query(
      query,
      [firstName, lastName, email, phone, department, position, qualifications, hashedPassword],
      (err, result) => {
        if (err) {
          console.error("Error creating staff account:", err);
          if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ error: "Email already exists" });
          }
          return res.status(500).json({ error: "Database error" });
        }

        res.json({
          success: true,
          staffId: result.insertId,
        });
      },
    );
  } catch (error) {
    console.error("Staff signup error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Staff login
app.post("/api/staff/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const query = `SELECT * FROM staff WHERE email = ? AND status IN ('Active', 'Pending')`;

    db.query(query, [email], async (err, results) => {
      if (err) {
        console.error("Error during staff login:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (results.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const staff = results[0];

      if (staff.status === "Pending") {
        return res.status(401).json({ error: "Account pending approval" });
      }

      const isValidPassword = await bcrypt.compare(password, staff.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Create session
      req.session.staffId = staff.id;
      req.session.userType = "staff";

      res.json({
        success: true,
        staff: {
          id: staff.id,
          name: `${staff.first_name} ${staff.last_name}`,
          email: staff.email,
          department: staff.department,
          position: staff.position,
        },
      });
    });
  } catch (error) {
    console.error("Staff login error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Staff profile
app.get("/api/staff/profile", (req, res) => {
  if (!req.session.staffId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const query = `SELECT id, first_name, last_name, email, phone, department, position, qualifications, status, created_at 
                 FROM staff WHERE id = ?`;

  db.query(query, [req.session.staffId], (err, results) => {
    if (err) {
      console.error("Error fetching staff profile:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Staff not found" });
    }

    res.json({ success: true, staff: results[0] });
  });
});

// Staff overview
app.get("/api/staff/overview", (req, res) => {
  if (!req.session.staffId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const staffId = req.session.staffId;

  // Get staff department for filtering
  const staffQuery = `SELECT department FROM staff WHERE id = ?`;

  db.query(staffQuery, [staffId], (err, staffResults) => {
    if (err || staffResults.length === 0) {
      return res.status(500).json({ error: "Staff not found" });
    }

    const department = staffResults[0].department;

    // Get overview statistics
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM students s 
         JOIN courses c ON s.course_id = c.id 
         WHERE c.department = ? AND s.status IN ('Registered', 'Active')) as totalStudents,
        (SELECT COUNT(*) FROM assignments a 
         JOIN courses c ON a.course_id = c.id 
         WHERE c.department = ? AND a.due_date > NOW()) as activeAssignments,
        (SELECT COUNT(*) FROM assignment_submissions asub 
         JOIN assignments a ON asub.assignment_id = a.id 
         JOIN courses c ON a.course_id = c.id 
         WHERE c.department = ? AND asub.score IS NULL) as pendingSubmissions,
        (SELECT COUNT(*) FROM exams e 
         JOIN courses c ON e.course_id = c.id 
         WHERE c.department = ? AND e.scheduled_date > NOW() AND e.is_active = 1) as upcomingExams
    `;

    db.query(statsQuery, [department, department, department, department], (err, statsResults) => {
      if (err) {
        console.error("Error fetching staff overview stats:", err);
        return res.status(500).json({ error: "Database error" });
      }

      const stats = statsResults[0];

      // Get recent activities
      const activitiesQuery = `
        SELECT 'assignment' as type, a.title, 'New assignment created' as description, a.created_at
        FROM assignments a 
        JOIN courses c ON a.course_id = c.id 
        WHERE c.department = ? AND a.created_by = ?
        UNION ALL
        SELECT 'submission' as type, CONCAT('Assignment: ', a.title) as title, 
               CONCAT('New submission from ', s.first_name, ' ', s.last_name) as description, asub.submission_date as created_at
        FROM assignment_submissions asub
        JOIN assignments a ON asub.assignment_id = a.id
        JOIN students s ON asub.student_id = s.id
        JOIN courses c ON a.course_id = c.id
        WHERE c.department = ?
        ORDER BY created_at DESC 
        LIMIT 10
      `;

      db.query(activitiesQuery, [department, staffId, department], (err, activitiesResults) => {
        if (err) {
          console.error("Error fetching staff activities:", err);
          return res.status(500).json({ error: "Database error" });
        }

        res.json({
          success: true,
          stats,
          recentActivities: activitiesResults,
        });
      });
    });
  });
});

// Staff students
app.get("/api/staff/students", (req, res) => {
  if (!req.session.staffId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const staffId = req.session.staffId;

  // Get staff department
  const staffQuery = `SELECT department FROM staff WHERE id = ?`;

  db.query(staffQuery, [staffId], (err, staffResults) => {
    if (err || staffResults.length === 0) {
      return res.status(500).json({ error: "Staff not found" });
    }

    const department = staffResults[0].department;

    const studentsQuery = `
      SELECT s.*, c.name as course_name 
      FROM students s 
      JOIN courses c ON s.course_id = c.id 
      WHERE c.department = ? 
      ORDER BY s.created_at DESC
    `;

    db.query(studentsQuery, [department], (err, results) => {
      if (err) {
        console.error("Error fetching students:", err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({ success: true, students: results });
    });
  });
});

// Staff assignments
app.get("/api/staff/assignments", (req, res) => {
  if (!req.session.staffId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const staffId = req.session.staffId;

  const assignmentsQuery = `
    SELECT a.*, c.name as course_name,
           (SELECT COUNT(*) FROM assignment_submissions asub WHERE asub.assignment_id = a.id) as submission_count
    FROM assignments a 
    JOIN courses c ON a.course_id = c.id 
    WHERE a.created_by = ?
    ORDER BY a.created_at DESC
  `;

  db.query(assignmentsQuery, [staffId], (err, results) => {
    if (err) {
      console.error("Error fetching assignments:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({ success: true, assignments: results });
  });
});

// Create assignment
app.post("/api/staff/create-assignment", (req, res) => {
  if (!req.session.staffId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { title, courseId, description, instructions, dueDate, maxScore } = req.body;
  const staffId = req.session.staffId;

  const query = `INSERT INTO assignments (title, course_id, description, instructions, due_date, max_score, created_by, date_given) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`;

  db.query(query, [title, courseId, description, instructions, dueDate, maxScore, staffId], (err, result) => {
    if (err) {
      console.error("Error creating assignment:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({
      success: true,
      assignmentId: result.insertId,
    });
  });
});

// Staff logout
app.post("/api/staff/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying staff session:", err);
      return res.status(500).json({ error: "Logout failed" });
    }
    res.json({ success: true });
  });
});

// Admin API endpoints

// Admin login
app.post("/api/admin/login", async (req, res) => {
  const { username, password, role } = req.body;

  try {
    const query = `SELECT * FROM admins WHERE username = ? AND role = ? AND status = 'Active'`;

    db.query(query, [username, role], async (err, results) => {
      if (err) {
        console.error("Error during admin login:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (results.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const admin = results[0];

      const isValidPassword = await bcrypt.compare(password, admin.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Create session
      req.session.adminId = admin.id;
      req.session.userType = "admin";

      res.json({
        success: true,
        admin: {
          id: admin.id,
          name: `${admin.first_name} ${admin.last_name}`,
          username: admin.username,
          role: admin.role,
        },
      });
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin profile
app.get("/api/admin/profile", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const query = `SELECT id, first_name, last_name, username, email, role, status, created_at 
                 FROM admins WHERE id = ?`;

  db.query(query, [req.session.adminId], (err, results) => {
    if (err) {
      console.error("Error fetching admin profile:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Admin not found" });
    }

    res.json({ success: true, admin: results[0] });
  });
});

// Admin overview
app.get("/api/admin/overview", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Get overview statistics
  const statsQuery = `
    SELECT 
      (SELECT COUNT(*) FROM students WHERE status IN ('Registered', 'Active')) as totalStudents,
      (SELECT COUNT(*) FROM staff WHERE status = 'Active') as activeStaff,
      (SELECT COALESCE(SUM(amount), 0) FROM payments 
       WHERE MONTH(payment_date) = MONTH(CURRENT_DATE()) 
       AND YEAR(payment_date) = YEAR(CURRENT_DATE())) as monthlyRevenue,
      (SELECT COUNT(*) FROM students WHERE status = 'Applied') + 
      (SELECT COUNT(*) FROM staff WHERE status = 'Pending') as pendingApprovals
  `;

  db.query(statsQuery, (err, statsResults) => {
    if (err) {
      console.error("Error fetching admin overview stats:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const stats = statsResults[0];

    // Get monthly revenue data for chart
    const revenueQuery = `
      SELECT MONTH(payment_date) as month, SUM(amount) as total
      FROM payments 
      WHERE YEAR(payment_date) = YEAR(CURRENT_DATE())
      GROUP BY MONTH(payment_date)
      ORDER BY month
    `;

    db.query(revenueQuery, (err, revenueResults) => {
      if (err) {
        console.error("Error fetching revenue data:", err);
        return res.status(500).json({ error: "Database error" });
      }

      // Create 12-month array with zeros
      const revenueData = new Array(12).fill(0);

      // Fill in actual data
      revenueResults.forEach((row) => {
        revenueData[row.month - 1] = Number.parseFloat(row.total);
      });

      res.json({
        success: true,
        stats,
        revenueData,
      });
    });
  });
});

// Get all students for admin
app.get("/api/admin/students", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const studentsQuery = `
    SELECT s.*, c.name as course_name 
    FROM students s 
    LEFT JOIN courses c ON s.course_id = c.id 
    ORDER BY s.created_at DESC
  `;

  db.query(studentsQuery, (err, results) => {
    if (err) {
      console.error("Error fetching students:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({ success: true, students: results });
  });
});

// Get pending approvals
app.get("/api/admin/pending-approvals", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const pendingQuery = `
    SELECT s.*, c.name as course_name 
    FROM students s 
    JOIN courses c ON s.course_id = c.id 
    WHERE s.status = 'Applied'
    ORDER BY s.created_at ASC
  `;

  db.query(pendingQuery, (err, results) => {
    if (err) {
      console.error("Error fetching pending approvals:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({ success: true, students: results });
  });
});

// Approve student
app.post("/api/admin/approve-student/:studentId", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { studentId } = req.params;

  const query = `UPDATE students SET status = 'Registered' WHERE id = ? AND status = 'Applied'`;

  db.query(query, [studentId], (err, result) => {
    if (err) {
      console.error("Error approving student:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Student not found or already processed" });
    }

    res.json({ success: true });
  });
});

// Admin logout
app.post("/api/admin/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying admin session:", err);
      return res.status(500).json({ error: "Logout failed" });
    }
    res.json({ success: true });
  });
});

// Utility function to generate admission number
function generateAdmissionNumber(courseAbbr, certType) {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `${courseAbbr}/${year}/${certType}/${randomNum}`;
}

// Paystack verification function
async function verifyPaystackPayment(reference) {
  try {
    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
    });
    return response.data.data;
  } catch (error) {
    console.error('Paystack verify error:', error);
    return null;
  }
}

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large" });
    }
  }
  res.status(500).json({ error: error.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the application at http://localhost:${PORT}`);
});

module.exports = app;
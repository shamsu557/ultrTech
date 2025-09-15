const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const mysql = require('mysql');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const db = require('./mysql');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const PAYSTACK_SECRET_KEY = 'sk_live_b04d777ada9b06c828dc4084969106de9d8044a3';

// Temporary storage for pending applications
const pendingApplications = {};

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


// Routes
app.get("/student/login", (req, res) => {
  res.sendFile(path.join(__dirname, "student_login.html"));
});

// Utility function for Paystack payment verification
async function verifyPaystackPayment(reference) {
  try {
    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
    });
    return response.data.data;
  } catch (error) {
    console.error("Paystack verification error:", error);
    return null;
  }
}
// Utility function to generate admission number
function generateAdmissionNumber(courseAbbr, certType) {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `${courseAbbr}/${year}/${certType}/${randomNum}`;
}


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

app.get('/student/dashboard', (req, res) => {
  if (!req.session.student) {
    return res.redirect('/student/login');
  }
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

// API Routes

// Handle application form submission
app.post("/api/student/apply", upload.single("profilePicture"), (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    gender,
    dateOfBirth,
    address,
    courseId,
    schedule,
  } = req.body;

  // Validate required fields
  if (!firstName || !lastName || !email || !phone || !gender || !dateOfBirth || !address || !courseId || !schedule) {
    return res.status(400).json({ success: false, error: "All fields are required" });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, error: "Profile picture is required" });
  }

  // Validate courseId
  const courseCheckQuery = `SELECT id FROM courses WHERE id = ? LIMIT 1`;
  db.query(courseCheckQuery, [courseId], (err, courseResults) => {
    if (err) {
      console.error("Error checking course:", err);
      return res.status(500).json({ success: false, error: "Database error: " + err.message });
    }

    if (courseResults.length === 0) {
      return res.status(400).json({ success: false, error: `Invalid course ID: ${courseId}` });
    }

    // Generate application number
    const applicationNumber = "APP" + Date.now();

    // Store profile picture path
    const profilePicturePath = req.file ? req.file.path : null;

    // Store application data temporarily
    pendingApplications[applicationNumber] = {
      firstName,
      lastName,
      email,
      phone,
      gender,
      dateOfBirth,
      address,
      courseId,
      schedule,
      profilePicturePath,
    };

    res.json({
      success: true,
      applicationNumber,
      profilePicturePath,
    });
  });
});

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

// Verify application or admission
// Verify application or admission
app.get("/api/student/verify-application/:identifier", (req, res) => {
  const { identifier } = req.params;
  const { type } = req.query;

  if (!type || !['application', 'admission'].includes(type)) {
    return res.status(400).json({ success: false, error: "Invalid type parameter. Must be 'application' or 'admission'" });
  }

  // Decode URL-encoded identifier to handle slashes (e.g., CYB%2F2025%2FDIP%2F181 -> CYB/2025/DIP/181)
  const decodedIdentifier = decodeURIComponent(identifier);

  // Validate admission number format for type=admission
  if (type === "admission") {
    const admissionNumberRegex = /^[A-Z]{2,5}\/[0-9]{4}\/(CERT|DIP)\/[0-9]{3}$/;
    if (!admissionNumberRegex.test(decodedIdentifier)) {
      return res.status(400).json({ success: false, error: "Invalid admission number format. Expected format: CYB/2025/DIP/181" });
    }
  }

  let query;
  let params = [decodedIdentifier];

  if (type === "application") {
    query = `
      SELECT s.*, 
           c.name AS course_name, c.registration_fee, c.duration, 
           c.certification_type, c.abbreviation
    FROM students s 
    JOIN courses c ON s.course_id = c.id 
    WHERE s.application_number = ? AND s.status IN ('Applied', 'Registered')
    `;
  } else {
    query = `
      SELECT s.*, 
           c.name AS course_name, c.registration_fee, c.duration, 
           c.certification_type, c.abbreviation
    FROM students s 
    JOIN courses c ON s.course_id = c.id 
    WHERE s.admission_number = ? AND s.status IN ('Registered', 'Active')
    `;
  }

  db.query(query, params, (err, results) => {
    if (err) {
      console.error("Error verifying application/admission:", err);
      return res.status(500).json({ success: false, error: "Database error: " + err.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ success: false, error: `No ${type} found for identifier: ${decodedIdentifier}` });
    }

    const student = results[0];
    const regFee = student.registration_fee;

    const paymentQuery = `
      SELECT SUM(amount) as total_paid, MAX(installment_number) as max_installment,
             MAX(installment_type) as latest_installment_type
      FROM payments 
      WHERE student_id = ? AND payment_type = 'Registration'
    `;
    db.query(paymentQuery, [student.id], (err, payRes) => {
      if (err) {
        console.error("Error checking payments:", err);
        return res.status(500).json({ success: false, error: "Database error: " + err.message });
      }

      const totalPaid = payRes[0].total_paid || 0;
      const maxInstallment = payRes[0].max_installment || 0;
      const latestInstallmentType = payRes[0].latest_installment_type || null;

      let paymentStatus = "Pending";
      let paymentOptions = [];
      let installmentLabel = "";
      let nextStep = "payRegistration";

      if (totalPaid === 0 || (totalPaid > 0 && totalPaid < regFee)) {
        paymentStatus = totalPaid === 0 ? (student.admission_number ? "Partial" : "Pending") : "Partial";
        paymentOptions = totalPaid === 0 && !student.admission_number ? ["Full", "Installment"] : ["Installment"];
        installmentLabel = "Second Installment";
        nextStep = student.password_hash ? "paySecondInstallment" : "setupSecurity";
      } else if (totalPaid >= regFee) {
        paymentStatus = "Completed";
        paymentOptions = [];
        nextStep = student.password_hash ? "downloadReceipt" : "setupSecurity";
      }

      res.json({
        success: true,
        student: {
          id: student.id,
          first_name: student.first_name,
          last_name: student.last_name,
          email: student.email,
          application_number: student.application_number,
          admission_number: student.admission_number,
          course_name: student.course_name,
          duration: student.duration,
          certification_type: student.certification_type,
          registration_fee: regFee,
          schedule: student.schedule,
          abbreviation: student.abbreviation,
          totalPaid,
          installmentNumber: maxInstallment,
          installmentType: latestInstallmentType,
          paymentStatus,
          paymentOptions,
          installmentLabel,
          nextStep,
          hasPassword: !!student.password_hash
        }
      });
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
        return res.status(500).json({ success: false, error: "Database error: " + err.message });
      }

      res.json({ success: true });
    });
  } catch (error) {
    console.error("Error hashing password:", error);
    res.status(500).json({ success: false, error: "Server error: " + error.message });
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
      const studentQuery = `
        SELECT s.*, c.abbreviation, c.certification_type, c.registration_fee 
        FROM students s 
        JOIN courses c ON s.course_id = c.id 
        WHERE s.id = ?`;
      
      db.query(studentQuery, [studentId], (err, studentResults) => {
        if (err || studentResults.length === 0) {
          console.error("Error fetching student:", err);
          return res.status(500).json({ success: false, error: "Student not found" });
        }

        const student = studentResults[0];
        const registrationFee = student.registration_fee;

        const paymentQuery = `
          SELECT SUM(amount) as total_paid, MAX(installment_type) as latest_installment_type
          FROM payments 
          WHERE student_id = ? AND payment_type = 'Registration'`;
        
        db.query(paymentQuery, [studentId], (err, paymentResults) => {
          if (err) {
            console.error("Error checking payments:", err);
            return res.status(500).json({ success: false, error: "Database error: " + err.message });
          }

          const totalPaid = paymentResults[0].total_paid || 0;

          // ❌ Block only if NO payment at all
          if (totalPaid === 0) {
            return res.status(400).json({ 
              success: false, 
              error: "No registration payment made yet",
              nextStep: 'payRegistration'
            });
          }

          // Proceed even if first installment only
          let admissionNumber = student.admission_number;
          if (!admissionNumber) {
            admissionNumber = generateAdmissionNumber(
              student.abbreviation,
              student.certification_type === "Certificate" ? "CERT" : "DIP"
            );
            db.query(`UPDATE students SET admission_number=? WHERE id=?`, [admissionNumber, studentId]);
          }

          const updateQuery = `
            UPDATE students 
            SET admission_number = ?, status = 'Registered', highest_qualification = ?
            WHERE id = ?`;

          const highestQualPath = req.files.highestQualification ? req.files.highestQualification[0].path : null;

          db.query(updateQuery, [admissionNumber, highestQualPath, studentId], (err, result) => {
            if (err) {
              console.error("Error completing registration:", err);
              return res.status(500).json({ success: false, error: "Database error: " + err.message });
            }

            // Save additional qualifications if provided
            const qualPromises = [];
            for (let i = 0; i < 3; i++) {
              const qualName = req.body[`additionalQualName_${i}`];
              const qualFile = req.files[`additionalQualFile_${i}`];

              if (qualName && qualFile) {
                const qualQuery = `
                  INSERT INTO qualifications (student_id, qualification_name, file_path, is_highest) 
                  VALUES (?, ?, ?, false)`;
                qualPromises.push(
                  new Promise((resolve, reject) => {
                    db.query(qualQuery, [studentId, qualName, qualFile[0].path], (err, result) => {
                      if (err) reject(err);
                      else resolve(result);
                    });
                  })
                );
              }
            }

            Promise.all(qualPromises)
              .then(() => {
                res.json({
                  success: true,
                  admissionNumber,
                  balance: Math.max(registrationFee - totalPaid, 0), // amount remaining
                  nextStep: 'downloadReceipt'
                });
              })
              .catch((error) => {
                console.error("Error saving qualifications:", error);
                res.json({
                  success: true,
                  admissionNumber,
                  balance: Math.max(registrationFee - totalPaid, 0),
                  warning: "Registration complete but some qualifications failed to save",
                  nextStep: 'downloadReceipt'
                });
              });
          });
        });
      });
    } catch (error) {
      console.error("Error completing registration:", error);
      res.status(500).json({ success: false, error: "Server error: " + error.message });
    }
  }
);

// Payment verification
// Payment verification
app.post("/api/payment/verify", async (req, res) => {
  try {
    const { reference, paymentType, studentId, applicationNumber, installmentType: inputInstallmentType } = req.body;

    const transaction = await verifyPaystackPayment(reference);
    if (!transaction || transaction.status !== "success") {
      return res.status(400).json({ success: false, error: "Payment verification failed" });
    }

    const amount = transaction.amount / 100; // Paystack returns in kobo

    /* ---------------- APPLICATION PAYMENT ---------------- */
    if (paymentType === "Application") {
      if (!applicationNumber) {
        return res.status(400).json({ success: false, error: "Application number is required" });
      }

      const applicationData = pendingApplications[applicationNumber];
      if (!applicationData) {
        return res.status(400).json({ success: false, error: "Application data not found" });
      }

      const courseCheckQuery = `SELECT id FROM courses WHERE id = ? LIMIT 1`;
      db.query(courseCheckQuery, [applicationData.courseId], (err, courseResults) => {
        if (err) {
          console.error("Error checking course:", err);
          return res.status(500).json({ success: false, error: "Database error: " + err.message });
        }

        if (courseResults.length === 0) {
          return res.status(400).json({ success: false, error: `Invalid course ID: ${applicationData.courseId}` });
        }

        const query = `INSERT INTO students (
          application_number, first_name, last_name, email, phone, gender, 
          date_of_birth, address, course_id, schedule, profile_picture, 
          status, reference_number, amount, payment_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Applied', ?, ?, NOW())`;

        db.query(
          query,
          [
            applicationNumber,
            applicationData.firstName,
            applicationData.lastName,
            applicationData.email,
            applicationData.phone,
            applicationData.gender,
            applicationData.dateOfBirth,
            applicationData.address,
            applicationData.courseId,
            applicationData.schedule,
            applicationData.profilePicturePath,
            reference,
            amount,
          ],
          (err, result) => {
            if (err) {
              console.error("Error creating application:", err);
              if (err.code === "ER_DUP_ENTRY") {
                return res.status(400).json({ success: false, error: "Email already exists" });
              }
              return res.status(500).json({ success: false, error: `Database error: ${err.message}` });
            }

            delete pendingApplications[applicationNumber];
            res.json({ success: true, applicationNumber });
          }
        );
      });

    /* ---------------- REGISTRATION PAYMENT ---------------- */
    } else if (paymentType === "Registration") {
      if (!studentId) {
        return res.status(400).json({ success: false, error: "Missing studentId for registration payment" });
      }

      // 1. Get student and course details
      const studentCheckQuery = `SELECT s.*, 
         c.name AS course_name, 
         c.registration_fee, 
         c.duration, 
         c.certification_type, 
         c.abbreviation
          FROM students s 
          JOIN courses c ON s.course_id = c.id 
          WHERE s.id = ? 
          LIMIT 1`;
      db.query(studentCheckQuery, [studentId], (err, studentResults) => {
        if (err || studentResults.length === 0) {
          console.error("Error checking student:", err);
          return res.status(400).json({ success: false, error: "Student not found or invalid" });
        }

        let student = studentResults[0];
        const regFee = student.registration_fee;

        // 2. Get existing payments
        const sumQuery = `SELECT SUM(amount) as total_paid, MAX(installment_number) as max_installment, 
                         MAX(installment_type) as latest_installment_type
                         FROM payments WHERE student_id = ? AND payment_type = 'Registration'`;
        db.query(sumQuery, [studentId], (err, sumResults) => {
          if (err) {
            console.error("Error checking payments:", err);
            return res.status(500).json({ success: false, error: "Database error: " + err.message });
          }

          const totalPaidSoFar = sumResults[0].total_paid || 0;
          const maxInstallment = sumResults[0].max_installment || 0;
          const latestInstallmentType = sumResults[0].latest_installment_type || null;
          const newTotal = totalPaidSoFar + amount;

          // 3. Determine installment details
          let installmentType = inputInstallmentType || (amount >= regFee ? "full" : (totalPaidSoFar > 0 ? "second" : "first"));
          let dbInstallmentType = installmentType === "full" ? "full" : "half";
          let installmentNumber = totalPaidSoFar > 0 ? 2 : 1;
          let totalInstallments = installmentType === "full" ? 1 : 2;
          let status = newTotal >= regFee ? "Completed" : "Pending";

          // 4. Generate admission number if missing (on first or full payment)
          let admissionNumber = student.admission_number;
          if (!admissionNumber && (installmentType === "first" || installmentType === "full")) {
            admissionNumber = generateAdmissionNumber(
              student.abbreviation,
              student.certification_type === "Certificate" ? "CERT" : "DIP"
            );
            db.query(`UPDATE students SET admission_number = ? WHERE id = ?`, [admissionNumber, studentId], (err) => {
              if (err) {
                console.error("Error generating admission number:", err);
              }
            });
            student.admission_number = admissionNumber;
          }

          // 5. Update payments table with installment_type
          if (installmentType === "second") {
            db.query(
              `UPDATE payments SET installment_type = 'full' WHERE student_id = ? AND payment_type = 'Registration'`,
              [studentId],
              (err) => {
                if (err) {
                  console.error("Error updating payment installment_type:", err);
                }
              }
            );
          }

          // 6. Record payment
          const paymentQuery = `
            INSERT INTO payments (
              student_id, payment_type, amount, reference_number,
              installment_number, total_installments, status, paystack_reference, installment_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          db.query(
            paymentQuery,
            [studentId, paymentType, amount, reference, installmentNumber, totalInstallments, status, reference, dbInstallmentType],
            (err) => {
              if (err) {
                console.error("Error recording payment:", err);
                return res.status(500).json({ success: false, error: "Payment recording failed: " + err.message });
              }

              // 7. Update student status if fully paid
              if (status === "Completed" && student.status !== "Registered") {
                db.query(`UPDATE students SET status = 'Registered' WHERE id = ?`, [studentId], (err) => {
                  if (err) {
                    console.error("Error updating student status:", err);
                  }
                  student.status = "Registered";
                });
              }

              // 8. Re-query payments for latest totals
              const paymentQuery2 = `SELECT SUM(amount) as total_paid, MAX(installment_number) as max_installment, 
                                   MAX(installment_type) as latest_installment_type
                                   FROM payments WHERE student_id = ? AND payment_type = 'Registration'`;
              db.query(paymentQuery2, [studentId], (err, payRes) => {
                if (err) {
                  console.error("Error re-checking payments:", err);
                  return res.status(500).json({ success: false, error: "Database error: " + err.message });
                }

                const totalPaid = payRes[0].total_paid || 0;
                const maxInstallment = payRes[0].max_installment || 0;
                const latestInstallmentType = payRes[0].latest_installment_type || null;

                // 9. Compute derived fields
                let paymentStatus = "Pending";
                let paymentOptions = [];
                let installmentLabel = "";
                let nextStep = "payRegistration";

                if (totalPaid === 0 || (totalPaid > 0 && totalPaid < regFee)) {
                  paymentStatus = totalPaid === 0 ? (student.admission_number ? "Partial" : "Pending") : "Partial";
                  paymentOptions = totalPaid === 0 && !student.admission_number ? ["Full", "Installment"] : ["Installment"];
                  installmentLabel = "Second Installment";
                  nextStep = student.password_hash ? "paySecondInstallment" : "setupSecurity";
                } else if (totalPaid >= regFee) {
                  paymentStatus = "Completed";
                  paymentOptions = [];
                  nextStep = student.password_hash ? "downloadReceipt" : "setupSecurity";
                }

                // 10. Return consistent student object
                res.json({
                  success: true,
                  student: {
                    id: student.id,
                    first_name: student.first_name,
                    last_name: student.last_name,
                    email: student.email,
                    application_number: student.application_number,
                    admission_number: student.admission_number,
                    course_name: student.course_name,
                    duration: student.duration,
                    certification_type: student.certification_type,
                    registration_fee: regFee,
                    schedule: student.schedule,
                    abbreviation: student.abbreviation,
                    totalPaid,
                    installmentNumber: maxInstallment,
                    installmentType: latestInstallmentType,
                    paymentStatus,
                    paymentOptions,
                    installmentLabel,
                    nextStep,
                    hasPassword: !!student.password_hash
                  }
                });
              });
            }
          );
        });
      });
    } else {
      return res.status(400).json({ success: false, error: "Invalid payment type" });
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({ success: false, error: "Internal server error: " + error.message });
  }
}); 
// Download receipt
app.get("/api/receipt/download", (req, res) => {
  const { type, ref, appNum, admissionNum } = req.query;

  if (!type || !['application', 'registration'].includes(type)) {
    return res.status(400).json({ error: "Invalid type. Must be 'application' or 'registration'." });
  }

  if (type === "application") {
    if (!appNum || !ref) {
      return res.status(400).json({ error: "Application number and reference required for application receipt." });
    }

    // ✅ Changed here: removed c.schedule, so schedule comes from students table
    const query = `
      SELECT s.*, 
             c.name AS course_name
      FROM students s 
      LEFT JOIN courses c ON s.course_id = c.id 
      WHERE s.application_number = ? 
        AND s.reference_number = ?
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
      const doc = new PDFDocument({ margin: 50 });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="application_form_receipt_${appNum}.pdf"`);
      doc.pipe(res);

      const logoPath = path.join(__dirname, "logo.png");
      try { doc.image(logoPath, 50, 30, { width: 100 }); } catch (e) {}

      doc.moveDown(5);
      doc.fontSize(22).text("UltraTech Global Solution LTD", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(12).text("Gwammaja Housing Estate, Opp. Orthopedic Hospital, Dala", { align: "center" });
      doc.text("Email: info@ultratechglobalsolution.com.ng | Phone: 08024606199, 08167030902", { align: "center" });
      doc.moveDown(2);

      doc.fontSize(16).text("Application Form", { align: "center" });
      doc.moveDown(2);

      doc.fontSize(12).text(`Application Number: ${student.application_number}`);
      doc.text(`Name: ${student.first_name} ${student.last_name}`);
      doc.text(`Email: ${student.email}`);
      doc.text(`Phone: ${student.phone}`);
      doc.text(`Gender: ${student.gender}`);
      doc.text(`Date of Birth: ${student.date_of_birth}`);
      doc.text(`Address: ${student.address}`);
      doc.text(`Course: ${student.course_name || "Unknown"}`);
      doc.text(`Schedule: ${student.schedule}`); // ✅ This now comes from students table
      doc.moveDown(2);

      doc.fontSize(16).text("Application Payment Receipt", { align: "center" });
      doc.moveDown(2);

      const formattedAmount = new Intl.NumberFormat("en-NG").format(student.amount);
      doc.fontSize(12).text(`Payment Type: Application Fee`);
      doc.text(`Payment Amount: ₦${formattedAmount}`);
      doc.text(`Reference: ${student.reference_number}`);
      doc.text(`Payment Date: ${student.payment_date}`);
      doc.moveDown(2);

      doc.fontSize(10).text("This form + receipt is system-generated and valid without signature.", { align: "center" });

      doc.end();
    });
  } else if (type === "registration") {
    if (!admissionNum) {
      return res.status(400).json({ error: "Admission number required for registration receipt." });
    }

    const query = `
      SELECT s.*, c.name AS course_name, c.certification_type,
             p.amount, p.payment_date, p.installment_number, p.total_installments, 
             p.status, p.reference_number, p.installment_type
      FROM students s 
      JOIN courses c ON s.course_id = c.id 
      JOIN payments p ON s.id = p.student_id 
      WHERE s.admission_number = ? AND p.payment_type = 'Registration'
      ORDER BY p.installment_number ASC
    `;

    db.query(query, [admissionNum], (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: "Database query failed." });
      }
      if (!results || results.length === 0) {
        return res.status(404).json({ error: "Registration payments not found." });
      }

      const student = results[0];
      const totalPaid = results.reduce((sum, p) => sum + Number(p.amount), 0);
      if (totalPaid < student.registration_fee) {
        return res.status(400).json({ error: "Registration payment incomplete. Receipt available only after full payment." });
      }

      const doc = new PDFDocument({ margin: 50 });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="registration_receipt_${admissionNum}.pdf"`);
      doc.pipe(res);

      const logoPath = path.join(__dirname, "logo.png");
      try { doc.image(logoPath, 50, 30, { width: 100 }); } catch (e) {}

      doc.moveDown(5);
      doc.fontSize(22).text("UltraTech Global Solution LTD", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(12).text("Gwammaja Housing Estate, Opp. Orthopedic Hospital, Dala", { align: "center" });
      doc.text("Email: info@ultratechglobalsolution.com.ng | Phone: 08024606199, 08167030902", { align: "center" });
      doc.moveDown(2);

      doc.fontSize(16).text("Registration Payment Receipt", { align: "center" });
      doc.moveDown(2);

      doc.fontSize(12).text(`Admission Number: ${student.admission_number}`);
      doc.text(`Name: ${student.first_name} ${student.last_name}`);
      doc.text(`Email: ${student.email}`);
      doc.text(`Phone: ${student.phone}`);
      doc.text(`Course: ${student.course_name || "Unknown"}`);
      doc.text(`Schedule: ${student.schedule}`); // ✅ Also from students table
      doc.moveDown();

      results.forEach(payment => {
        const formattedAmount = new Intl.NumberFormat("en-NG").format(payment.amount);
        doc.text(`Installment ${payment.installment_number} of ${payment.total_installments} (${payment.installment_type})`);
        doc.text(`Amount: ₦${formattedAmount}`);
        doc.text(`Reference: ${payment.reference_number}`);
        doc.text(`Payment Date: ${payment.payment_date}`);
        doc.text(`Status: ${payment.status}`);
        doc.moveDown();
      });

      doc.fontSize(10).text("This receipt is system-generated and valid with the director's signature.", { align: "center" });
      doc.end();
    });
  }
});

// Admission letter
app.get("/api/admission-letter/download", (req, res) => {
  const { admissionNum } = req.query;

  if (!admissionNum) {
    return res.status(400).json({ error: "Admission number is required." });
  }

  const query = `
    SELECT s.*, 
           c.name AS course_name, 
           c.certification_type, 
           c.duration
    FROM students s 
    JOIN courses c ON s.course_id = c.id 
    WHERE s.admission_number = ? 
      AND s.status IN ('Registered', 'Active')
  `;

  db.query(query, [admissionNum], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database query failed." });
    }
    if (!results || results.length === 0) {
      return res.status(404).json({ error: "Student not found." });
    }

    const student = results[0];

    const paymentQuery = `
      SELECT SUM(amount) as total_paid
      FROM payments 
      WHERE student_id = ? AND payment_type = 'Registration'
    `;
    
    db.query(paymentQuery, [student.id], (err, paymentResults) => {
      if (err) {
        console.error("Error checking payments:", err);
        return res.status(500).json({ error: "Database error: " + err.message });
      }

      const totalPaid = paymentResults[0].total_paid || 0;
      if (totalPaid === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "No registration payment made yet",
          nextStep: 'payRegistration'
        });
      }

      const doc = new PDFDocument({ margin: 50 });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="admission_letter_${admissionNum}.pdf"`);
      doc.pipe(res);

      const logoPath = path.join(__dirname, "logo.png");
      try { doc.image(logoPath, 50, 30, { width: 100 }); } catch (e) {}

      doc.moveDown(5);
      doc.fontSize(22).text("UltraTech Global Solution LTD", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(12).text("Gwammaja Housing Estate, Opp. Orthopedic Hospital, Dala", { align: "center" });
      doc.text("Email: info@ultratechglobalsolution.com.ng | Phone: 08024606199, 08167030902", { align: "center" });
      doc.moveDown(2);

      doc.fontSize(16).text("Admission Letter", { align: "center" });
      doc.moveDown(2);

      doc.fontSize(12).text(`Date: ${new Date().toLocaleDateString()}`, { align: "right" });
      doc.moveDown();
      doc.text(`Dear ${student.first_name} ${student.last_name},`);
      doc.moveDown();
      doc.text("Congratulations on your admission to UltraTech Global Solution LTD! We are pleased to offer you a place in the following program:");
      doc.moveDown();
      doc.text(`Program: ${student.course_name}`);
      doc.text(`Certification Type: ${student.certification_type}`);
      doc.text(`Duration: ${student.duration}`);
      doc.text(`Schedule: ${student.schedule || "Not specified"}`); // ✅ From students table
      doc.text(`Your Admission Number is : ${student.admission_number}`);
      doc.text(`Start Date: 20th September 2025`);
      doc.moveDown(); 
      doc.text("We look forward to supporting you in your educational journey.");
      doc.moveDown();
      doc.text("Sincerely,");
      doc.moveDown();

      const signaturePath = path.join(__dirname, "signature.jfif");
      try {
        doc.image(signaturePath, 50, doc.y, { width: 120 });
      } catch (e) {
        console.error("Error loading signature:", e);
      }

      doc.moveDown(4);
      doc.font("Helvetica-Bold")
         .fontSize(12)
         .text("Director", 50, doc.y);

      doc.moveDown(1);
      doc.font("Times-Italic")
         .fontSize(14)
         .text("Junaidu Muhammad", 50, doc.y);

      doc.end();
    });
  });
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
// Get security question
// Get Security Question
app.get("/api/student/security-question/:admissionNumber", (req, res) => {
  const admissionNumber = req.params.admissionNumber.trim().toUpperCase();

  const query = "SELECT security_question FROM students WHERE admission_number = ?";
  db.query(query, [admissionNumber], (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }

    if (results.length === 0) {
      return res.json({ success: false, message: "Student not found" });
    }

    res.json({ success: true, securityQuestion: results[0].security_question });
  });
});
// Verify Security Answer
app.post("/api/student/verify-answer", (req, res) => {
  const { admissionNumber, securityAnswer } = req.body;

  if (!admissionNumber || !securityAnswer) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  const query = "SELECT security_answer FROM students WHERE admission_number = ?";
  db.query(query, [admissionNumber.trim().toUpperCase()], (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }

    if (results.length === 0) {
      return res.json({ success: false, message: "Student not found" });
    }

    const storedAnswer = results[0].security_answer?.trim().toUpperCase();
    const providedAnswer = securityAnswer.trim().toUpperCase();

    if (storedAnswer === providedAnswer) {
      res.json({ success: true, message: "Answer verified" });
    } else {
      res.json({ success: false, message: "Incorrect security answer" });
    }
  });
});
// Reset Password
app.post("/api/student/reset-password", async (req, res) => {
  const { admissionNumber, newPassword } = req.body;

  if (!admissionNumber || !newPassword) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const query = "UPDATE students SET password_hash = ? WHERE admission_number = ?";
    db.query(query, [hashedPassword, admissionNumber.trim().toUpperCase()], (err, result) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
      }

      if (result.affectedRows === 0) {
        return res.json({ success: false, message: "Student not found" });
      }

      res.json({ success: true, message: "Password reset successful" });
    });
  } catch (error) {
    console.error("Hashing error:", error);
    res.status(500).json({ success: false, message: "Error resetting password" });
  }
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

// API to get a list of courses a staff member is attached to
app.get('/api/courses/staff', isAuthenticatedStaff, (req, res) => {
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
            console.error("Error fetching staff courses:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
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
            a.description,
            a.instructions,
            a.due_date,
            a.max_score,
            a.course_id,
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

// API to get a single assignment
app.get('/api/assignments/:id', isAuthenticatedStaff, (req, res) => {
    const staffId = req.session.staffDatabaseId;
    const assignmentId = req.params.id;

    const query = `
        SELECT
            a.id,
            a.title,
            c.name AS course,
            a.description,
            a.instructions,
            a.due_date,
            a.max_score,
            a.course_id,
            (SELECT COUNT(*) FROM assignment_submissions sub WHERE sub.assignment_id = a.id) AS submissions
        FROM assignments a
        JOIN staff_courses sc ON a.course_id = sc.course_id
        JOIN courses c ON a.course_id = c.id
        WHERE a.id = ? AND sc.staff_id = ?
    `;

    db.query(query, [assignmentId, staffId], (err, results) => {
        if (err) {
            console.error('Error fetching assignment:', err);
            return res.status(500).json({ error: 'Failed to fetch assignment data.' });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Assignment not found or you are not authorized to access it.' });
        }
        res.json(results[0]);
    });
});

// API to create a new assignment
app.post('/api/assignments', isAuthenticatedStaff, (req, res) => {
    const { title, course_id, description, instructions, date_given, due_date, max_score } = req.body;
    const staffId = req.session.staffDatabaseId;

    if (!title || !course_id || !instructions || !due_date || !max_score) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    // Verify staff is authorized to create assignments for the course
    const authQuery = 'SELECT * FROM staff_courses WHERE staff_id = ? AND course_id = ?';
    db.query(authQuery, [staffId, course_id], (authErr, authResults) => {
        if (authErr) {
            console.error('Error verifying course authorization:', authErr);
            return res.status(500).json({ error: 'Failed to create assignment.' });
        }
        if (authResults.length === 0) {
            return res.status(403).json({ error: 'You are not authorized to create assignments for this course.' });
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
});

// API to update an assignment
app.put('/api/assignments/:id', isAuthenticatedStaff, (req, res) => {
    const assignmentId = req.params.id;
    const { title, course_id, description, instructions, due_date, max_score } = req.body;
    const staffId = req.session.staffDatabaseId;

    if (!title || !course_id || !instructions || !due_date || !max_score) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    // Verify staff is authorized to update the assignment
    const authQuery = `
        SELECT a.id
        FROM assignments a
        JOIN staff_courses sc ON a.course_id = sc.course_id
        WHERE a.id = ? AND sc.staff_id = ? AND sc.course_id = ?
    `;
    db.query(authQuery, [assignmentId, staffId, course_id], (authErr, authResults) => {
        if (authErr) {
            console.error('Error verifying assignment authorization:', authErr);
            return res.status(500).json({ error: 'Failed to update assignment.' });
        }
        if (authResults.length === 0) {
            return res.status(403).json({ error: 'You are not authorized to update this assignment or the course is invalid.' });
        }

        const updateQuery = `
            UPDATE assignments
            SET title = ?, course_id = ?, description = ?, instructions = ?, due_date = ?, max_score = ?
            WHERE id = ?
        `;
        const values = [title, course_id, description, instructions, due_date, max_score, assignmentId];

        db.query(updateQuery, values, (err, result) => {
            if (err) {
                console.error('Error updating assignment:', err);
                return res.status(500).json({ error: 'Failed to update assignment.' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Assignment not found.' });
            }
            res.json({ message: 'Assignment updated successfully.' });
        });
    });
});

// API to delete an assignment
app.delete('/api/assignments/:id', isAuthenticatedStaff, (req, res) => {
    const assignmentId = req.params.id;
    const staffId = req.session.staffDatabaseId;

    // Verify staff is authorized to delete the assignment
    const authQuery = `
        SELECT a.id
        FROM assignments a
        JOIN staff_courses sc ON a.course_id = sc.course_id
        WHERE a.id = ? AND sc.staff_id = ?
    `;
    db.query(authQuery, [assignmentId, staffId], (authErr, authResults) => {
        if (authErr) {
            console.error('Error verifying assignment authorization:', authErr);
            return res.status(500).json({ error: 'Failed to delete assignment.' });
        }
        if (authResults.length === 0) {
            return res.status(403).json({ error: 'You are not authorized to delete this assignment.' });
        }

        const deleteQuery = 'DELETE FROM assignments WHERE id = ?';
        db.query(deleteQuery, [assignmentId], (err, result) => {
            if (err) {
                console.error('Error deleting assignment:', err);
                return res.status(500).json({ error: 'Failed to delete assignment.' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Assignment not found.' });
            }
            res.json({ message: 'Assignment deleted successfully.' });
        });
    });
});

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

  const statsQuery = `
    SELECT 
      (SELECT COUNT(*) FROM students WHERE status IN ('Registered', 'Active')) as totalStudents,
      (SELECT COUNT(*) FROM staff WHERE status = 'Active') as totalStaff,
      (SELECT COUNT(*) FROM courses WHERE is_active = 1) as totalCourses,
      (SELECT COUNT(*) FROM assignments WHERE due_date > NOW()) as activeAssignments,
      (SELECT COUNT(*) FROM exams WHERE scheduled_date > NOW() AND is_active = 1) as upcomingExams
  `;

  db.query(statsQuery, (err, statsResults) => {
    if (err) {
      console.error("Error fetching admin overview stats:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const stats = statsResults[0];

    const activitiesQuery = `
      SELECT 'student' as type, CONCAT(s.first_name, ' ', s.last_name) as title, 
             CONCAT('New student registered: ', c.name) as description, s.created_at
      FROM students s 
      JOIN courses c ON s.course_id = c.id
      WHERE s.status IN ('Registered', 'Active')
      UNION ALL
      SELECT 'staff' as type, CONCAT(st.first_name, ' ', st.last_name) as title, 
             'New staff added' as description, st.created_at
      FROM staff st
      WHERE st.status = 'Active'
      ORDER BY created_at DESC 
      LIMIT 10
    `;

    db.query(activitiesQuery, (err, activitiesResults) => {
      if (err) {
        console.error("Error fetching admin activities:", err);
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

// Admin manage students
app.get("/api/admin/students", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const studentsQuery = `
    SELECT s.*, c.name as course_name 
    FROM students s 
    JOIN courses c ON s.course_id = c.id 
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

// Admin manage staff
app.get("/api/admin/staff", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const staffQuery = `SELECT * FROM staff ORDER BY created_at DESC`;

  db.query(staffQuery, (err, results) => {
    if (err) {
      console.error("Error fetching staff:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({ success: true, staff: results });
  });
});

// Admin approve staff
app.post("/api/admin/approve-staff", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { staffId } = req.body;

  const query = `UPDATE staff SET status = 'Active' WHERE id = ? AND status = 'Pending'`;

  db.query(query, [staffId], (err, result) => {
    if (err) {
      console.error("Error approving staff:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Staff not found or already approved" });
    }

    res.json({ success: true });
  });
});

// Admin manage courses
app.get("/api/admin/courses", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const coursesQuery = `SELECT * FROM courses ORDER BY name`;

  db.query(coursesQuery, (err, results) => {
    if (err) {
      console.error("Error fetching courses:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({ success: true, courses: results });
  });
});

// Admin create course
app.post("/api/admin/create-course", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { name, abbreviation, department, duration, certification_type, registration_fee, is_active } = req.body;

  const query = `INSERT INTO courses (name, abbreviation, department, duration, certification_type, registration_fee, is_active) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;

  db.query(
    query,
    [name, abbreviation, department, duration, certification_type, registration_fee, is_active ? 1 : 0],
    (err, result) => {
      if (err) {
        console.error("Error creating course:", err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        success: true,
        courseId: result.insertId,
      });
    }
  );
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


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
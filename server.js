
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

const PAYSTACK_SECRET_KEY = 'sk_live_b04d777ada9b06c828dc4084969106de9d8044a3';

// Temporary storage for pending applications
const pendingApplications = {};

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

// Session configuration
app.use(session({
  secret: 'your-secret-key', // Replace with a secure secret
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true if using HTTPS
}));

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

    const allowedTypes = /jpeg|jpg|png|jfif|pdf|doc|docx|zip/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only JPG, JPEG, PNG, JFIF, PDF, DOC, DOCX, or ZIP are allowed."
        )
      );
    }
  },
});

// Utility: normalize profile picture path
function normalizeProfilePath(picturePath) {
  if (!picturePath) return null
  return picturePath
    .replace(/\\/g, "/") // Windows \ → /
    .replace(/^uploads\//, "/uploads/") // prepend slash
}

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.studentId) {
    next()
  } else {
    res.status(401).json({ success: false, error: "Authentication required" })
  }
}
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
    delete student.password_hash;
    delete student.security_answer;

    res.json({ success: true, student });
  });
});

// Student overview data
app.get("/api/student-overview", (req, res) => {
  if (!req.session.studentId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const studentId = req.session.studentId;

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
    stats.overallGrade = 0;

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

    const outstanding = [];

    const feeQuery = `
      SELECT c.registration_fee 
      FROM students s 
      JOIN courses c ON s.course_id = c.id 
      WHERE s.id = ?
    `;

    db.query(feeQuery, [req.session.studentId], (err, feeResults) => {
      if (err || feeResults.length === 0) {
        console.error("Error fetching registration fee:", err);
        return res.status(500).json({ error: "Database error" });
      }

      const registrationFee = feeResults[0].registration_fee;

      const registrationPayments = payments.filter((p) => p.payment_type === "Registration");
      const totalRegistrationPaid = registrationPayments.reduce((sum, p) => sum + Number.parseFloat(p.amount), 0);

      if (totalRegistrationPaid < registrationFee) {
        outstanding.push({
          type: "Registration",
          amount: registrationFee - totalRegistrationPaid,
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

  const { assignmentId } = req.body;
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
      detailed: [],
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

  const staffQuery = `SELECT department FROM staff WHERE id = ?`;

  db.query(staffQuery, [staffId], (err, staffResults) => {
    if (err || staffResults.length === 0) {
      return res.status(500).json({ error: "Staff not found" });
    }

    const department = staffResults[0].department;

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


// Input validation
const validateInput = (admissionNumber, password) => {
  const admissionRegex = /^[A-Z0-9/]{6,17}$/;
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/;
  return (
    admissionRegex.test(admissionNumber) &&
    (!password || passwordRegex.test(password))
  );
};

// Student login
app.post('/api/student/login', (req, res) => {
  const { admissionNumber, password } = req.body;

  if (!admissionNumber || !password) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  if (!validateInput(admissionNumber)) {
    return res.status(400).json({ success: false, message: 'Invalid admission number format.' });
  }

  db.query('SELECT * FROM students WHERE admission_number = ?', [admissionNumber], (err, results) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }

    console.log('Query results:', results);

    if (!results || results.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid Admission Number or Password' });
    }

    const student = results[0];
    bcrypt.compare(password, student.password_hash, (err, validPassword) => {
      if (err) {
        console.error('Password comparison error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
      }

      if (!validPassword) {
        return res.status(401).json({ success: false, message: 'Invalid Admission Number or Password' });
      }

      req.session.student = {
        id: student.id,
        admissionNumber: student.admission_number,
        name: `${student.first_name} ${student.last_name}`,
      };

      return res.json({ success: true, message: 'Login successful' });
    });
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
// Student profile endpoint
app.get("/api/student/profile", isAuthenticated, (req, res) => {
  const query = `
        SELECT s.id, s.name, s.email, s.phone, s.address, s.profile_picture, 
               c.name AS course_name 
        FROM students s 
        LEFT JOIN courses c ON s.course_id = c.id 
        WHERE s.id = ?
    `

  db.query(query, [req.session.studentId], (err, results) => {
    if (err) {
      console.error("Error fetching student profile:", err)
      return res.status(500).json({ error: "Database error" })
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Student not found" })
    }

    const student = results[0]
    student.profile_picture = normalizeProfilePath(student.profile_picture)
    delete student.password_hash // Remove sensitive data

    res.json({ success: true, student })
  })
})

// Overview data endpoint
app.get("/api/student/overview", isAuthenticated, (req, res) => {
  const studentId = req.session.studentId

  // Get assignments count
  const assignmentsQuery = `
        SELECT 
            COUNT(*) as total,
            COUNT(sub.id) as completed
        FROM assignments a
        LEFT JOIN students s ON s.course_id = a.course_id
        LEFT JOIN assignment_submissions sub ON a.id = sub.assignment_id AND sub.student_id = s.id
        WHERE s.id = ?
    `

  // Get overall grade
  const gradeQuery = `
        SELECT 
            AVG(CASE WHEN sub.score IS NOT NULL THEN (sub.score / a.max_score) * 100 END) as assignment_avg,
            (SELECT AVG((score / total_questions) * 100) FROM exam_results WHERE student_id = ?) as exam_avg
        FROM assignments a
        LEFT JOIN students s ON s.course_id = a.course_id
        LEFT JOIN assignment_submissions sub ON a.id = sub.assignment_id AND sub.student_id = s.id
        WHERE s.id = ?
    `

  // Get upcoming exams
  const examsQuery = `
        SELECT COUNT(*) as upcoming
        FROM exams e
        LEFT JOIN students s ON s.course_id = e.course_id
        WHERE s.id = ? AND e.scheduled_date > NOW() AND e.is_active = 1
    `

  // Get recent activities
  const activitiesQuery = `
        (SELECT 'assignment' as type, a.title, 'New assignment posted' as description, a.created_at
         FROM assignments a
         LEFT JOIN students s ON s.course_id = a.course_id
         WHERE s.id = ?
         ORDER BY a.created_at DESC LIMIT 3)
        UNION ALL
        (SELECT 'result' as type, CONCAT('Assignment: ', a.title) as title, 
         CONCAT('Score: ', sub.score, '/', a.max_score) as description, sub.graded_at as created_at
         FROM assignment_submissions sub
         JOIN assignments a ON sub.assignment_id = a.id
         WHERE sub.student_id = ? AND sub.score IS NOT NULL
         ORDER BY sub.graded_at DESC LIMIT 3)
        ORDER BY created_at DESC LIMIT 5
    `

  Promise.all([
    new Promise((resolve, reject) => {
      db.query(assignmentsQuery, [studentId], (err, results) => {
        if (err) reject(err)
        else resolve(results[0] || { total: 0, completed: 0 })
      })
    }),
    new Promise((resolve, reject) => {
      db.query(gradeQuery, [studentId, studentId], (err, results) => {
        if (err) reject(err)
        else {
          const result = results[0] || {}
          const assignmentAvg = result.assignment_avg || 0
          const examAvg = result.exam_avg || 0
          const overall = Math.round(assignmentAvg * 0.6 + examAvg * 0.3)
          resolve({ overallGrade: overall })
        }
      })
    }),
    new Promise((resolve, reject) => {
      db.query(examsQuery, [studentId], (err, results) => {
        if (err) reject(err)
        else resolve(results[0] || { upcoming: 0 })
      })
    }),
    new Promise((resolve, reject) => {
      db.query(activitiesQuery, [studentId, studentId], (err, results) => {
        if (err) reject(err)
        else resolve(results || [])
      })
    }),
  ])
    .then(([assignments, grade, exams, activities]) => {
      res.json({
        success: true,
        stats: {
          totalAssignments: assignments.total,
          completedAssignments: assignments.completed,
          overallGrade: grade.overallGrade,
          upcomingExams: exams.upcoming,
        },
        recentActivities: activities,
      })
    })
    .catch((err) => {
      console.error("Overview data error:", err)
      res.status(500).json({ success: false, error: "Failed to load overview data" })
    })
})

// Payments endpoint
app.get("/api/student/payments", isAuthenticated, (req, res) => {
  const studentId = req.session.studentId

  const paymentsQuery = `
        SELECT * FROM payments 
        WHERE student_id = ? 
        ORDER BY payment_date DESC
    `

  // Get outstanding payments (this would be based on your business logic)
  const outstandingQuery = `
        SELECT 
            'Registration' as type,
            'Course registration fee' as description,
            c.registration_fee as amount,
            NULL as dueDate
        FROM students s
        JOIN courses c ON s.course_id = c.id
        WHERE s.id = ? AND s.status = 'Applied'
        AND NOT EXISTS (
            SELECT 1 FROM payments p 
            WHERE p.student_id = s.id AND p.payment_type = 'Registration' AND p.status = 'Completed'
        )
    `

  Promise.all([
    new Promise((resolve, reject) => {
      db.query(paymentsQuery, [studentId], (err, results) => {
        if (err) reject(err)
        else resolve(results || [])
      })
    }),
    new Promise((resolve, reject) => {
      db.query(outstandingQuery, [studentId], (err, results) => {
        if (err) reject(err)
        else resolve(results || [])
      })
    }),
  ])
    .then(([payments, outstanding]) => {
      res.json({
        success: true,
        payments,
        outstanding,
      })
    })
    .catch((err) => {
      console.error("Payments data error:", err)
      res.status(500).json({ success: false, error: "Failed to load payments data" })
    })
})

// Assignments endpoint
app.get("/api/student/assignments", isAuthenticated, (req, res) => {
  const studentId = req.session.studentId

  const query = `
        SELECT 
            a.*,
            sub.id as submission_id,
            sub.submission_date,
            sub.score,
            sub.feedback,
            sub.file_path as submission_file
        FROM assignments a
        LEFT JOIN students s ON s.course_id = a.course_id
        LEFT JOIN assignment_submissions sub ON a.id = sub.assignment_id AND sub.student_id = s.id
        WHERE s.id = ?
        ORDER BY a.due_date DESC
    `

  db.query(query, [studentId], (err, results) => {
    if (err) {
      console.error("Assignments error:", err)
      return res.status(500).json({ success: false, error: "Failed to load assignments" })
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
            submission_date: row.submission_date,
            score: row.score,
            feedback: row.feedback,
            file_path: row.submission_file,
          }
        : null,
    }))

    res.json({ success: true, assignments })
  })
})

// Submit assignment endpoint
app.post("/api/student/submit-assignment", isAuthenticated, upload.single("assignmentFile"), (req, res) => {
  const { assignmentId, submissionNotes } = req.body

  if (!req.file) {
    console.error("No file uploaded for assignment ID:", assignmentId)
    return res.status(400).json({ success: false, message: "No file uploaded" })
  }

  const filePath = `/uploads/${req.file.filename}`

  // Check if submission already exists
  const checkQuery = `SELECT id FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?`

  db.query(checkQuery, [assignmentId, req.session.studentId], (err, results) => {
    if (err) {
      console.error("Error checking existing submission:", err)
      return res.status(500).json({ success: false, message: "Database error" })
    }

    if (results.length > 0) {
      // Update existing submission
      const updateQuery = `
        UPDATE assignment_submissions 
        SET file_path = ?, submission_date = NOW(), notes = ?
        WHERE id = ?
      `

      db.query(updateQuery, [filePath, submissionNotes || null, results[0].id], (err, result) => {
        if (err) {
          console.error("Error updating submission:", err)
          return res.status(500).json({ success: false, message: "Update failed" })
        }

        console.log("Updated submission for assignment ID:", assignmentId)
        res.json({ success: true, message: "Submission updated successfully" })
      })
    } else {
      // Create new submission
      const insertQuery = `
        INSERT INTO assignment_submissions (assignment_id, student_id, file_path, submission_date, notes) 
        VALUES (?, ?, ?, NOW(), ?)
      `

      db.query(insertQuery, [assignmentId, req.session.studentId, filePath, submissionNotes || null], (err, result) => {
        if (err) {
          console.error("Error creating submission:", err)
          return res.status(500).json({ success: false, message: "Submission failed" })
        }

        console.log("Submitted new assignment for ID:", assignmentId)
        res.json({ success: true, message: "Assignment submitted successfully" })
      })
    }
  })
})

// Results endpoint
app.get("/api/student/results", isAuthenticated, (req, res) => {
  const studentId = req.session.studentId

  const query = `
        SELECT 
            'Assignment' as type,
            a.title,
            sub.score,
            a.max_score,
            ROUND((sub.score / a.max_score) * 100) as percentage,
            sub.graded_at as date
        FROM assignment_submissions sub
        JOIN assignments a ON sub.assignment_id = a.id
        WHERE sub.student_id = ? AND sub.score IS NOT NULL
        
        UNION ALL
        
        SELECT 
            e.exam_type as type,
            e.title,
            er.score,
            er.total_questions as max_score,
            ROUND((er.score / er.total_questions) * 100) as percentage,
            er.completed_at as date
        FROM exam_results er
        JOIN exams e ON er.exam_id = e.id
        WHERE er.student_id = ?
        
        ORDER BY date DESC
    `

  db.query(query, [studentId, studentId], (err, results) => {
    if (err) {
      console.error("Results error:", err)
      return res.status(500).json({ success: false, error: "Failed to load results" })
    }

    // Calculate averages
    const assignments = results.filter((r) => r.type === "Assignment")
    const tests = results.filter((r) => r.type === "Test")
    const exams = results.filter((r) => r.type === "Exam")

    const assignmentAverage =
      assignments.length > 0
        ? Math.round(assignments.reduce((sum, a) => sum + a.percentage, 0) / assignments.length)
        : 0

    const testAverage =
      tests.length > 0 ? Math.round(tests.reduce((sum, t) => sum + t.percentage, 0) / tests.length) : 0

    const examAverage =
      exams.length > 0 ? Math.round(exams.reduce((sum, e) => sum + e.percentage, 0) / exams.length) : 0

    res.json({
      success: true,
      results: {
        assignmentAverage,
        testAverage,
        examAverage,
        detailed: results,
      },
    })
  })
})

// Exams endpoint
app.get("/api/student/exams", isAuthenticated, (req, res) => {
  const studentId = req.session.studentId

  const examsQuery = `
        SELECT e.*
        FROM exams e
        LEFT JOIN students s ON s.course_id = e.course_id
        WHERE s.id = ? AND e.scheduled_date > NOW()
        ORDER BY e.scheduled_date ASC
    `

  const historyQuery = `
        SELECT 
            e.title as exam_title,
            e.exam_type,
            er.score,
            er.total_questions,
            er.time_taken_minutes,
            er.completed_at
        FROM exam_results er
        JOIN exams e ON er.exam_id = e.id
        WHERE er.student_id = ?
        ORDER BY er.completed_at DESC
    `

  Promise.all([
    new Promise((resolve, reject) => {
      db.query(examsQuery, [studentId], (err, results) => {
        if (err) reject(err)
        else resolve(results || [])
      })
    }),
    new Promise((resolve, reject) => {
      db.query(historyQuery, [studentId], (err, results) => {
        if (err) reject(err)
        else resolve(results || [])
      })
    }),
  ])
    .then(([exams, history]) => {
      res.json({
        success: true,
        exams,
        history,
      })
    })
    .catch((err) => {
      console.error("Exams data error:", err)
      res.status(500).json({ success: false, error: "Failed to load exams data" })
    })
})

// Resources endpoint
app.get("/api/student/resources", isAuthenticated, (req, res) => {
  const studentId = req.session.studentId

  const query = `
        SELECT 
            r.*,
            CONCAT(st.first_name, ' ', st.last_name) as uploaded_by
        FROM resources r
        LEFT JOIN students s ON s.course_id = r.course_id
        LEFT JOIN staff st ON r.staff_id = st.id
        WHERE s.id = ?
        ORDER BY r.uploaded_at DESC
    `

  db.query(query, [studentId], (err, results) => {
    if (err) {
      console.error("Resources error:", err)
      return res.status(500).json({ success: false, error: "Failed to load resources" })
    }

    res.json({ success: true, resources: results || [] })
  })
})

// Update profile endpoint
app.post("/api/student/update-profile", isAuthenticated, (req, res) => {
  const { phone, address, profile_picture } = req.body

  const query = `
        UPDATE students 
        SET phone = ?, address = ?, profile_picture = ?
        WHERE id = ?
    `

  db.query(query, [phone || null, address || null, profile_picture || null, req.session.studentId], (err, result) => {
    if (err) {
      console.error("Error updating profile:", err)
      return res.status(500).json({ error: "Database error" })
    }

    if (result.affectedRows === 0) {
      console.error("No student updated for ID:", req.session.studentId)
      return res.status(404).json({ error: "Student not found" })
    }

    console.log("Profile updated for student ID:", req.session.studentId)
    res.json({ success: true })
  })
})

// Update profile picture endpoint
app.post("/api/student/update-profile-picture", isAuthenticated, upload.single("profilePicture"), (req, res) => {
  const studentId = req.session.studentId
  const profilePicture = req.file ? `/uploads/${req.file.filename}` : null

  if (!profilePicture) {
    return res.status(400).json({ success: false, error: "Profile picture is required" })
  }

  const query = `
        UPDATE students 
        SET profile_picture = ?
        WHERE id = ?
    `

  db.query(query, [profilePicture, studentId], (err, result) => {
    if (err) {
      console.error("Profile picture update error:", err)
      return res.status(500).json({ success: false, error: "Update failed" })
    }

    res.json({ success: true, profilePicture, message: "Profile picture updated successfully" })
  })
})

// Logout endpoint
app.post("/api/student/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err)
      return res.status(500).json({ success: false, error: "Logout failed" })
    }
    res.json({
      success: true,
      message: "Logged out successfully",
      redirect: "/student_login.html",
    })
  })
})

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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
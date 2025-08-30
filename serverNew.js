
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
function generateAdmissionNumber(abbreviation, certType) {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const year = new Date().getFullYear();
  return `${abbreviation}/${certType === 'Certificate' ? 'CERT' : 'DIP'}/${year}/${randomNum}`;
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
      SELECT s.*, c.name as course_name, c.registration_fee, c.duration, 
             c.certification_type, c.schedule, c.abbreviation
      FROM students s 
      JOIN courses c ON s.course_id = c.id 
      WHERE s.application_number = ? AND s.status IN ('Applied', 'Registered')
    `;
  } else {
    query = `
      SELECT s.*, c.name as course_name, c.registration_fee, c.duration, 
             c.certification_type, c.schedule, c.abbreviation
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
      const studentCheckQuery = `SELECT s.*, c.name as course_name, c.registration_fee, c.duration, 
                               c.certification_type, c.schedule, c.abbreviation
                               FROM students s 
                               JOIN courses c ON s.course_id = c.id 
                               WHERE s.id = ? LIMIT 1`;
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

    const query = `
      SELECT s.*, c.name AS course_name, c.schedule 
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
      doc.text(`Schedule: ${student.schedule}`);
      doc.text(`Profile Picture: ${student.profile_picture || "Not uploaded"}`);
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
      SELECT s.*, c.name AS course_name, c.schedule, c.certification_type,
             p.amount, p.payment_date, p.installment_number, p.total_installments, p.status, p.reference_number, p.installment_type
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
      doc.text(`Schedule: ${student.schedule}`);
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
    SELECT s.*, c.name AS course_name, c.schedule, c.certification_type, c.duration
    FROM students s 
    JOIN courses c ON s.course_id = c.id 
    WHERE s.admission_number = ? AND s.status IN ('Registered', 'Active')
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
      doc.text(`Schedule: ${student.schedule}`);
      doc.text(`Admission Number: ${student.admission_number}`);
      doc.text(`Start Date: 20th September 2025`);
      doc.moveDown();
      doc.text("We look forward to supporting you in your educational journey.");
      doc.moveDown();
      doc.text("Sincerely,");
      doc.moveDown();

      const signaturePath = path.join(__dirname, "signature.png");
      try { doc.image(signaturePath, 50, doc.y, { width: 100 }); } catch (e) {}
      doc.text("Junaidu Muhammad, Director", 50, doc.y + 10);

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
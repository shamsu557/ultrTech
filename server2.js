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

app.use(session({
  secret: process.env.SESSION_SECRET || 'your_session_secret_here',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

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
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|zip/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

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

app.get("/staff-signup", (req, res) => {
  res.sendFile(path.join(__dirname, "staff_signup.html"));
});

app.get("/staff/login", (req, res) => {
  res.sendFile(path.join(__dirname, "staff_login.html"));
});

app.get("/staff/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "staff_dashboard.html"));
});

app.get("/admin/login", (req, res) => {
  res.sendFile(path.join(__dirname, "admin_login.html"));
});

app.get("/admin/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "admin_dashboard.html"));
});

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

app.post("/api/application/verify", (req, res) => {
  const { applicationNumber } = req.body;

  if (!applicationNumber) {
    return res.status(400).json({ success: false, error: "Application number is required" });
  }

  const studentQuery = `SELECT id FROM students WHERE application_number = ? AND status = 'Applied'`;
  db.query(studentQuery, [applicationNumber], (err, studentResults) => {
    if (err) {
      console.error("Error checking student:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }

    if (studentResults.length === 0) {
      return res.json({ success: true, paid: false, error: "Application number not found" });
    }

    const paymentQuery = `SELECT p.* FROM payments p
                         JOIN students s ON p.student_id = s.id
                         WHERE s.application_number = ? AND p.payment_type = 'Application' 
                         AND p.amount = 100 AND p.status = 'Completed'`;

    db.query(paymentQuery, [applicationNumber], (err, paymentResults) => {
      if (err) {
        console.error("Error verifying application payment:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }

      if (paymentResults.length === 0) {
        return res.json({ success: true, paid: true });
      }

      res.json({ success: true, paid: true });
    });
  });
});

app.get("/api/application/details", (req, res) => {
  const { appNum } = req.query;

  if (!appNum) {
    return res.status(400).json({ success: false, error: "Application number is required" });
  }

  const query = `SELECT s.*, c.name as course_name, c.registration_fee, c.abbreviation, c.certification_type
                 FROM students s
                 JOIN courses c ON s.course_id = c.id
                 WHERE s.application_number = ? AND s.status = 'Applied'`;

  db.query(query, [appNum], (err, results) => {
    if (err) {
      console.error("Error fetching application details:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, error: "Application not found or already processed" });
    }

    res.json({
      success: true,
      student: results[0],
      registration_fee: results[0].registration_fee,
    });
  });
});

app.post("/api/payment/initiate", (req, res) => {
  const { student_id, amount, payment_type, installment_number, total_installments, application_number } = req.body;

  if (!student_id || !amount || !payment_type || !application_number) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  const reference = generateReference("REG");

  const query = `INSERT INTO payments (student_id, payment_type, amount, reference_number, installment_number, total_installments, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'Pending')`;

  db.query(query, [student_id, payment_type, amount, reference, installment_number, total_installments], (err, result) => {
    if (err) {
      console.error("Error initiating payment:", err);
      return res.status(500).json({ success: false, error: "Database error: " + err.message });
    }

    res.json({ success: true, reference });
  });
});

async function verifyPaystackPayment(reference) {
  try {
    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
    });
    return response.data.data;
  } catch (error) {
    console.error("Paystack verification error:", error.response?.data || error.message);
    return null;
  }
}

app.post("/api/payment/verify", async (req, res) => {
  try {
    const { reference, paymentType, applicationNumber } = req.body;

    if (!reference || !paymentType) {
      return res.status(400).json({ success: false, error: "Reference and payment type are required" });
    }

    console.log(`Verifying payment: reference=${reference}, paymentType=${paymentType}`);

    const transaction = await verifyPaystackPayment(reference);

    if (!transaction || transaction.status !== "success") {
      console.error("Paystack verification failed:", transaction?.status);
      return res.status(400).json({ success: false, error: "Payment verification failed" });
    }

    const amount = transaction.amount / 100; // Paystack returns in kobo
    const metadata = transaction.metadata || {};
    console.log("Paystack transaction metadata:", metadata);

    if (paymentType === "Application") {
      if (!applicationNumber || !metadata.course_id) {
        return res.status(400).json({ success: false, error: "Missing application number or course ID" });
      }

      const courseCheckQuery = `SELECT id FROM courses WHERE id = ? LIMIT 1`;
      db.query(courseCheckQuery, [metadata.course_id], (err, courseResults) => {
        if (err) {
          console.error("Error checking course:", err);
          return res.status(500).json({ success: false, error: "Database error: " + err.message });
        }

        if (courseResults.length === 0) {
          return res.status(400).json({ success: false, error: `Invalid course ID: ${metadata.course_id}` });
        }

        const checkDuplicateQuery = `SELECT id FROM students WHERE email = ? OR application_number = ?`;
        db.query(checkDuplicateQuery, [metadata.email, applicationNumber], (err, duplicateResults) => {
          if (err) {
            console.error("Error checking duplicates:", err);
            return res.status(500).json({ success: false, error: "Database error: " + err.message });
          }

          if (duplicateResults.length > 0) {
            return res.status(400).json({ success: false, error: "Email or application number already exists" });
          }

          const studentQuery = `INSERT INTO students (application_number, first_name, last_name, email, phone, gender, date_of_birth, address, course_id, schedule, profile_picture, status, reference_number, amount, payment_date)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Applied', ?, ?, NOW())`;
          db.query(
            studentQuery,
            [
              applicationNumber,
              metadata.first_name,
              metadata.last_name,
              metadata.email,
              metadata.phone,
              metadata.gender,
              metadata.date_of_birth,
              metadata.address,
              metadata.course_id,
              metadata.schedule,
              metadata.profile_picture || null,
              reference,
              amount,
            ],
            (err, result) => {
              if (err) {
                console.error("Error creating application:", err);
                return res.status(500).json({ success: false, error: `Database error: ${err.message}` });
              }

              const paymentQuery = `INSERT INTO payments (student_id, payment_type, amount, reference_number, status, payment_date)
                                   VALUES (?, ?, ?, ?, 'Completed', NOW())`;
              db.query(
                paymentQuery,
                [result.insertId, "Application", amount, reference],
                (err, paymentResult) => {
                  if (err) {
                    console.error("Error recording payment:", err);
                    return res.status(500).json({ success: false, error: "Payment recording failed: " + err.message });
                  }
                  res.json({ success: true, applicationNumber });
                }
              );
            }
          );
        });
      });
    } else if (paymentType === "Registration") {
      let applicationNumberFromMetadata = null;
      if (metadata.custom_fields && Array.isArray(metadata.custom_fields)) {
        const appNumField = metadata.custom_fields.find(
          (field) => field.variable_name === "application_number"
        );
        applicationNumberFromMetadata = appNumField ? appNumField.value : null;
      }

      if (!applicationNumberFromMetadata) {
        console.error("Missing application_number in metadata.custom_fields", { metadata });
        return res.status(400).json({ success: false, error: "Missing application number in metadata" });
      }

      const installmentNumber = metadata.custom_fields?.find(
        (field) => field.variable_name === "installment_number"
      )?.value || 1;
      const totalInstallments = metadata.custom_fields?.find(
        (field) => field.variable_name === "total_installments"
      )?.value || 1;

      const studentQuery = `SELECT id FROM students WHERE application_number = ? AND status = 'Applied'`;
      db.query(studentQuery, [applicationNumberFromMetadata], (err, studentResults) => {
        if (err) {
          console.error("Error checking student:", err);
          return res.status(500).json({ success: false, error: "Database error: " + err.message });
        }

        if (studentResults.length === 0) {
          console.error("Student not found or not in 'Applied' status for application_number:", applicationNumberFromMetadata);
          return res.status(404).json({ success: false, error: "Student not found or already registered" });
        }

        const studentId = studentResults[0].id;

        const paymentCheckQuery = `SELECT id, amount FROM payments WHERE reference_number = ? AND student_id = ? AND payment_type = 'Registration'`;
        db.query(paymentCheckQuery, [reference, studentId], (err, paymentResults) => {
          if (err) {
            console.error("Error checking payment record:", err);
            return res.status(500).json({ success: false, error: "Database error: " + err.message });
          }

          if (paymentResults.length === 0) {
            console.error("No payment record found for reference:", reference, "and student_id:", studentId);
            return res.status(404).json({ success: false, error: "Payment record not found" });
          }

          const existingAmount = paymentResults[0].amount;

          if (Math.abs(existingAmount - amount) > 0.01) {
            console.error(`Amount mismatch: expected=${existingAmount}, received=${amount}`);
            return res.status(400).json({ success: false, error: "Payment amount mismatch" });
          }

          const query = `UPDATE payments SET status = 'Completed', amount = ?, installment_number = ?, total_installments = ?, payment_date = NOW()
                         WHERE reference_number = ? AND student_id = ? AND payment_type = 'Registration'`;

          db.query(query, [amount, installmentNumber, totalInstallments, reference, studentId], (err, result) => {
            if (err) {
              console.error("Error updating payment:", err);
              return res.status(500).json({ success: false, error: "Database error: " + err.message });
            }

            if (result.affectedRows === 0) {
              console.error("No rows updated for payment:", { reference, studentId });
              return res.status(404).json({ success: false, error: "Payment record not found or already processed" });
            }

            res.json({ success: true });
          });
        });
      });
    } else {
      console.error("Invalid payment type:", paymentType);
      res.status(400).json({ success: false, error: "Invalid payment type" });
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({ success: false, error: "Internal server error: " + error.message });
  }
});

app.post("/api/student/setup-security", async (req, res) => {
  const { studentId, password, securityQuestion, securityAnswer } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const trimmedUppercaseAnswer = securityAnswer.trim().toUpperCase();

    const query = `UPDATE students 
                   SET password_hash = ?, security_question = ?, security_answer = ?
                   WHERE id = ?`;

    db.query(query, [hashedPassword, securityQuestion, trimmedUppercaseAnswer, studentId], (err, result) => {
      if (err) {
        console.error("Error setting up security:", err);
        return res.status(500).json({ error: "Database error: " + err.message });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Student not found" });
      }

      res.json({ success: true });
    });
  } catch (error) {
    console.error("Error hashing password:", error);
    res.status(500).json({ error: "Server error: " + error.message });
  }
});

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
      const studentQuery = `SELECT s.*, c.abbreviation, c.certification_type 
                          FROM students s 
                          JOIN courses c ON s.course_id = c.id 
                          WHERE s.id = ?`;

      db.query(studentQuery, [studentId], (err, studentResults) => {
        if (err || studentResults.length === 0) {
          console.error("Error fetching student:", err);
          return res.status(500).json({ error: "Student not found" });
        }

        const student = studentResults[0];
        const admissionNumber = generateAdmissionNumber(
          student.abbreviation,
          student.certification_type === "Certificate" ? "CERT" : "DIP",
        ).toUpperCase();

        const updateQuery = `UPDATE students 
                           SET admission_number = ?, status = 'Registered', highest_qualification = ?
                           WHERE id = ?`;

        const highestQualPath = req.files.highestQualification ? req.files.highestQualification[0].path : null;

        db.query(updateQuery, [admissionNumber, highestQualPath, studentId], (err, result) => {
          if (err) {
            console.error("Error completing registration:", err);
            return res.status(500).json({ error: "Database error: " + err.message });
          }

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
      res.status(500).json({ error: "Server error: " + error.message });
    }
  },
);

app.post("/api/student/login", async (req, res) => {
  const { username, password } = req.body;
  const trimmedUppercaseUsername = username.trim().toUpperCase();

  try {
    let query;
    if (!password) {
      query = `SELECT * FROM students WHERE application_number = ? AND status = 'Applied'`;
    } else {
      query = `SELECT * FROM students WHERE admission_number = ? AND status IN ('Registered', 'Active')`;
    }

    db.query(query, [trimmedUppercaseUsername], async (err, results) => {
      if (err) {
        console.error("Error during login:", err);
        return res.status(500).json({ error: "Database error: " + err.message });
      }

      if (results.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const student = results[0];

      if (password && student.password_hash) {
        const isValidPassword = await bcrypt.compare(password, student.password_hash);
        if (!isValidPassword) {
          return res.status(401).json({ error: "Invalid credentials" });
        }
      }

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
    res.status(500).json({ error: "Server error: " + error.message });
  }
});

app.get("/api/student/security-question/:username", (req, res) => {
  const { username } = req.params;
  const trimmedUppercaseUsername = username.trim().toUpperCase();

  const query = `SELECT security_question FROM students WHERE admission_number = ?`;

  db.query(query, [trimmedUppercaseUsername], (err, results) => {
    if (err) {
      console.error("Error getting security question:", err);
      return res.status(500).json({ error: "Database error: " + err.message });
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

app.post("/api/student/reset-password", async (req, res) => {
  const { username, securityAnswer, newPassword } = req.body;
  const trimmedUppercaseUsername = username.trim().toUpperCase();
  const trimmedUppercaseAnswer = securityAnswer.trim().toUpperCase();

  try {
    const query = `SELECT id, security_answer FROM students WHERE admission_number = ?`;

    db.query(query, [trimmedUppercaseUsername], async (err, results) => {
      if (err) {
        console.error("Error during password reset:", err);
        return res.status(500).json({ error: "Database error: " + err.message });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: "Student not found" });
      }

      const student = results[0];

      if (student.security_answer !== trimmedUppercaseAnswer) {
        return res.status(401).json({ error: "Incorrect security answer" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const updateQuery = `UPDATE students SET password_hash = ? WHERE id = ?`;

      db.query(updateQuery, [hashedPassword, student.id], (err, result) => {
        if (err) {
          console.error("Error updating password:", err);
          return res.status(500).json({ error: "Database error: " + err.message });
        }

        res.json({ success: true });
      });
    });
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ error: "Server error: " + error.message });
  }
});

app.get("/api/receipt/download", (req, res) => {
  const { appNum } = req.query;

  if (!appNum) {
    return res.status(400).json({ error: "Application number is required" });
  }

  const query = `
    SELECT s.application_number, s.admission_number, s.first_name, s.last_name, s.email, 
           c.name AS course_name, c.duration
    FROM students s 
    JOIN courses c ON s.course_id = c.id
    WHERE s.application_number = ? AND s.status IN ('Registered', 'Active')
  `;

  db.query(query, [appNum], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database query failed: " + err.message });
    }

    if (!results || results.length === 0) {
      return res.status(404).json({ error: "Student not found or not registered" });
    }

    const student = results[0];

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="admission_letter_${appNum}.pdf"`
    );
    doc.pipe(res);

    const logoPath = path.join(__dirname, "logo.png");
    try {
      doc.image(logoPath, 50, 30, { width: 100 });
    } catch (e) {
      console.warn("Logo not found:", e.message);
    }
    doc.moveDown(5);

    doc.fontSize(22).text("UltraTech Global Solution LTD", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(12).text("Gwammaja Housing Estate, Opp. Orthopedic Hospital, Dala", { align: "center" });
    doc.text("Email: info@ultratechglobalsolution.com.ng | Phone: 08024606199, 08167030902", { align: "center" });
    doc.moveDown(2);

    doc.fontSize(16).text("Admission Letter", { align: "center" });
    doc.moveDown(2);

    doc.fontSize(12).text(`Date: ${new Date().toLocaleDateString('en-GB')}`);
    doc.moveDown(1);

    doc.text(`Dear ${student.first_name} ${student.last_name},`);
    doc.moveDown(1);

    doc.text(`We are pleased to offer you admission to study ${student.course_name} at UltraTech Global Solution LTD.`);
    doc.text(`This program is scheduled to run for a duration of ${student.duration || 'unspecified'}.`);
    doc.moveDown(1);

    doc.text(`Application Number: ${student.application_number}`);
    doc.text(`Admission Number: ${student.admission_number || 'Pending'}`);
    doc.text(`Email: ${student.email}`);
    doc.moveDown(2);

    doc.text("Please contact our admissions office for further details regarding your enrollment.");
    doc.moveDown(2);

    doc.text("Sincerely,");
    doc.moveDown(1);
    doc.text("Junaidu Muhammad");
    doc.text("Director");
    doc.moveDown(1);

    doc.fontSize(10).text("This letter is system-generated and valid without a physical signature.", { align: "center" });

    doc.end();
  });
});

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
      return res.status(500).json({ error: "Database error: " + err.message });
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

app.get("/api/student/payments", (req, res) => {
  if (!req.session.studentId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const paymentsQuery = `SELECT p.*, c.registration_fee
                        FROM payments p
                        JOIN students s ON p.student_id = s.id
                        JOIN courses c ON s.course_id = c.id
                        WHERE p.student_id = ? ORDER BY p.payment_date DESC`;

  db.query(paymentsQuery, [req.session.studentId], (err, payments) => {
    if (err) {
      console.error("Error fetching payments:", err);
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    const outstanding = [];
    const registrationPayments = payments.filter((p) => p.payment_type === "Registration");
    const totalRegistrationPaid = registrationPayments.reduce((sum, p) => sum + Number.parseFloat(p.amount), 0);
    const registrationFee = payments[0]?.registration_fee || 0;

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
      return res.status(500).json({ error: "Database error: " + err.message });
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
        return res.status(500).json({ error: "Database error: " + err.message });
      }

      res.json({
        success: true,
        stats,
        recentActivities: activitiesResults,
      });
    });
  });
});

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
      return res.status(500).json({ error: "Database error: " + err.message });
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
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    res.json({ success: true });
  });
});

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
      return res.status(500).json({ error: "Database error: " + err.message });
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
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    db.query(historyQuery, [req.session.studentId], (err, history) => {
      if (err) {
        console.error("Error fetching exam history:", err);
        return res.status(500).json({ error: "Database error: " + err.message });
      }

      res.json({
        success: true,
        exams,
        history,
      });
    });
  });
});

app.post("/api/student/update-profile", (req, res) => {
  if (!req.session.studentId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { phone, address } = req.body;

  const query = `UPDATE students SET phone = ?, address = ? WHERE id = ?`;

  db.query(query, [phone, address, req.session.studentId], (err, result) => {
    if (err) {
      console.error("Error updating profile:", err);
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    res.json({ success: true });
  });
});

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
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    res.json({
      success: true,
      profilePicture: profilePicturePath,
    });
  });
});

app.post("/api/student/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).json({ error: "Logout failed: " + err.message });
    }
    res.json({ success: true });
  });
});

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
          return res.status(500).json({ error: "Database error: " + err.message });
        }

        res.json({
          success: true,
          staffId: result.insertId,
        });
      },
    );
  } catch (error) {
    console.error("Staff signup error:", error);
    res.status(500).json({ error: "Server error: " + error.message });
  }
});

app.post("/api/staff/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const query = `SELECT * FROM staff WHERE email = ? AND status IN ('Active', 'Pending')`;

    db.query(query, [email], async (err, results) => {
      if (err) {
        console.error("Error during staff login:", err);
        return res.status(500).json({ error: "Database error: " + err.message });
      }

      if (results.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const staff = results[0];

      if (staff.status === "Pending") {
        return res.status(401).json({ error: "Account pending approval" });
      }

      constisValidPassword = await bcrypt.compare(password, staff.password_hash);
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
    res.status(500).json({ error: "Server error: " + error.message });
  }
});

app.get("/api/staff/profile", (req, res) => {
  if (!req.session.staffId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const query = `SELECT id, first_name, last_name, email, phone, department, position, qualifications, status, created_at 
                 FROM staff WHERE id = ?`;

  db.query(query, [req.session.staffId], (err, results) => {
    if (err) {
      console.error("Error fetching staff profile:", err);
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Staff not found" });
    }

    res.json({ success: true, staff: results[0] });
  });
});

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
        return res.status(500).json({ error: "Database error: " + err.message });
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
          return res.status(500).json({ error: "Database error: " + err.message });
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
        return res.status(500).json({ error: "Database error: " + err.message });
      }

      res.json({ success: true, students: results });
    });
  });
});

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
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    res.json({ success: true, assignments: results });
  });
});

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
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    res.json({
      success: true,
      assignmentId: result.insertId,
    });
  });
});

app.post("/api/staff/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying staff session:", err);
      return res.status(500).json({ error: "Logout failed: " + err.message });
    }
    res.json({ success: true });
  });
});

app.post("/api/admin/login", async (req, res) => {
  const { username, password, role } = req.body;

  try {
    const query = `SELECT * FROM admins WHERE username = ? AND role = ? AND status = 'Active'`;

    db.query(query, [username, role], async (err, results) => {
      if (err) {
        console.error("Error during admin login:", err);
        return res.status(500).json({ error: "Database error: " + err.message });
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
    res.status(500).json({ error: "Server error: " + error.message });
  }
});

app.get("/api/admin/profile", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const query = `SELECT id, first_name, last_name, username, email, role, status, created_at 
                 FROM admins WHERE id = ?`;

  db.query(query, [req.session.adminId], (err, results) => {
    if (err) {
      console.error("Error fetching admin profile:", err);
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Admin not found" });
    }

    res.json({ success: true, admin: results[0] });
  });
});

app.get("/api/admin/overview", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

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
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    const stats = statsResults[0];

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
        return res.status(500).json({ error: "Database error: " + err.message });
      }

      const revenueData = new Array(12).fill(0);
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
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    res.json({ success: true, students: results });
  });
});

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
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    res.json({ success: true, students: results });
  });
});

app.post("/api/admin/approve-student/:studentId", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { studentId } = req.params;

  const query = `UPDATE students SET status = 'Registered' WHERE id = ? AND status = 'Applied'`;

  db.query(query, [studentId], (err, result) => {
    if (err) {
      console.error("Error approving student:", err);
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Student not found or already processed" });
    }

    res.json({ success: true });
  });
});

app.post("/api/admin/reject-student/:studentId", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { studentId } = req.params;

  const query = `UPDATE students SET status = 'Rejected' WHERE id = ? AND status = 'Applied'`;

  db.query(query, [studentId], (err, result) => {
    if (err) {
      console.error("Error rejecting student:", err);
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Student not found or already processed" });
    }

    res.json({ success: true });
  });
});

app.get("/api/admin/staff", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const staffQuery = `
    SELECT id, first_name, last_name, email, phone, department, position, qualifications, status, created_at 
    FROM staff 
    ORDER BY created_at DESC
  `;

  db.query(staffQuery, (err, results) => {
    if (err) {
      console.error("Error fetching staff:", err);
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    res.json({ success: true, staff: results });
  });
});

app.post("/api/admin/approve-staff/:staffId", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { staffId } = req.params;

  const query = `UPDATE staff SET status = 'Active' WHERE id = ? AND status = 'Pending'`;

  db.query(query, [staffId], (err, result) => {
    if (err) {
      console.error("Error approving staff:", err);
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Staff not found or already processed" });
    }

    res.json({ success: true });
  });
});

app.post("/api/admin/reject-staff/:staffId", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { staffId } = req.params;

  const query = `UPDATE staff SET status = 'Rejected' WHERE id = ? AND status = 'Pending'`;

  db.query(query, [staffId], (err, result) => {
    if (err) {
      console.error("Error rejecting staff:", err);
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Staff not found or already processed" });
    }

    res.json({ success: true });
  });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying admin session:", err);
      return res.status(500).json({ error: "Logout failed: " + err.message });
    }
    res.json({ success: true });
  });
});

function generateReference(prefix) {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}`;
}

function generateAdmissionNumber(abbreviation, certType) {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${abbreviation}/${year}/${certType}/${randomNum}`;
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

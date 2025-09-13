const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const db = require("./mysql");
const multer = require('multer');

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

// Middleware to check if the user is an authenticated admin
const isAuthenticatedAdmin = (req, res, next) => {
  if (!req.session || !req.session.adminId) {
    console.error("Unauthorized access attempt at", new Date().toISOString());
    return res.status(401).json({ success: false, error: "Not authenticated. Session expired or invalid." });
  }
  db.query("SELECT role FROM admins WHERE id = ?", [req.session.adminId], (err, results) => {
    if (err) {
      console.error("Error verifying admin:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    if (results.length === 0) {
      console.error("Admin not found for ID:", req.session.adminId);
      return res.status(401).json({ success: false, error: "Admin not found" });
    }
    req.session.adminRole = results[0].role;
    next();
  });
};

// Middleware to check if the user is an Admin
const isAdmin = (req, res, next) => {
  if (req.session.adminRole === "Admin") {
    return next();
  }
  console.error("Unauthorized access attempt by non-Admin:", req.session.adminId);
  return res.status(403).json({ success: false, error: "Unauthorized access. Admin role required." });
};

// Admin login route
router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const initialUsername = "Admin";
  const initialPassword = "admin";

  if (username === initialUsername && password === initialPassword) {
    db.query("SELECT id, is_first_login FROM admins WHERE username = ?", [initialUsername], (err, results) => {
      if (err) {
        console.error("Error during login:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }
      if (results.length === 0) {
        bcrypt.hash(initialPassword, 10, (hashErr, hashedPassword) => {
          if (hashErr) {
            console.error("Error hashing password:", hashErr);
            return res.status(500).json({ success: false, error: "Server error" });
          }
          db.query(
            "INSERT INTO admins (username, password_hash, role, is_first_login) VALUES (?, ?, 'Admin', 1)",
            [initialUsername, hashedPassword],
            (insertErr, result) => {
              if (insertErr) {
                console.error("Error creating admin:", insertErr);
                return res.status(500).json({ success: false, error: "Failed to set up admin" });
              }
              req.session.adminId = result.insertId;
              req.session.adminRole = "Admin";
              console.log("Initial admin created:", { id: result.insertId });
              res.json({ success: true, message: "Initial login successful.", isFirstLogin: true, adminRole: "Admin" });
            }
          );
        });
      } else {
        req.session.adminId = results[0].id;
        req.session.adminRole = "Admin";
        console.log("Initial admin login:", { id: results[0].id });
        res.json({
          success: true,
          message: "Initial login successful.",
          isFirstLogin: results[0].is_first_login === 1,
          adminRole: "Admin"
        });
      }
    });
  } else {
    db.query(
      "SELECT id, password_hash, role, is_first_login FROM admins WHERE username = ?",
      [username],
      (err, results) => {
        if (err) {
          console.error("Error during login:", err);
          return res.status(500).json({ success: false, error: "Database error" });
        }
        if (results.length === 0) {
          console.error("Invalid credentials for username:", username);
          return res.status(401).json({ success: false, error: "Invalid username or password" });
        }
        bcrypt.compare(password, results[0].password_hash, (compareErr, isMatch) => {
          if (compareErr || !isMatch) {
            console.error("Invalid credentials for username:", username);
            return res.status(401).json({ success: false, error: "Invalid username or password" });
          }
          req.session.adminId = results[0].id;
          req.session.adminRole = results[0].role;
          console.log("Admin logged in:", { id: results[0].id, role: results[0].role });
          res.json({ success: true, isFirstLogin: results[0].is_first_login === 1, adminRole: results[0].role });
        });
      }
    );
  }
});

// Change credentials route
router.post("/change-credentials", [isAuthenticatedAdmin, isAdmin], (req, res) => {
  const { newUsername, newPassword } = req.body;
  const adminId = req.session.adminId;

  if (!newUsername || !newPassword) {
    console.error("Missing credentials for admin ID:", adminId);
    return res.status(400).json({ success: false, error: "New username and password are required." });
  }

  bcrypt.hash(newPassword, 10, (hashErr, hashedPassword) => {
    if (hashErr) {
      console.error("Error hashing password:", hashErr);
      return res.status(500).json({ success: false, error: "Server error" });
    }
    db.query(
      "UPDATE admins SET username = ?, password_hash = ?, is_first_login = 0 WHERE id = ?",
      [newUsername, hashedPassword, adminId],
      (err, result) => {
        if (err) {
          console.error("Error changing credentials:", err);
          return res.status(500).json({ success: false, error: "Database error" });
        }
        if (result.affectedRows === 0) {
          console.error("No admin updated for ID:", adminId);
          return res.status(404).json({ success: false, error: "Admin not found" });
        }
        console.log("Credentials updated for admin ID:", adminId);
        res.json({ success: true, message: "Credentials updated successfully. Please log in again." });
      }
    );
  });
});

// Admin management routes
router.post("/users", [isAuthenticatedAdmin, isAdmin], (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    console.error("Missing fields for new admin creation");
    return res.status(400).json({ success: false, error: "All fields are required." });
  }
  if (!['Deputy Admin', 'Assistant Admin'].includes(role)) {
    console.error("Invalid role for admin creation:", role);
    return res.status(400).json({ success: false, error: "Invalid role" });
  }

  bcrypt.hash(password, 10, (hashErr, hashedPassword) => {
    if (hashErr) {
      console.error("Error hashing password:", hashErr);
      return res.status(500).json({ success: false, error: "Server error" });
    }
    db.query(
      "INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)",
      [username, hashedPassword, role],
      (err, result) => {
        if (err) {
          console.error("Error creating admin:", err);
          return res.status(500).json({ success: false, error: "Database error" });
        }
        console.log("Admin created:", { id: result.insertId, username });
        res.json({ success: true, message: "Admin created successfully." });
      }
    );
  });
});

router.get("/users", [isAuthenticatedAdmin, isAdmin], (req, res) => {
  db.query(
    "SELECT id, username, role FROM admins WHERE role != 'Admin' OR id = ?",
    [req.session.adminId],
    (err, results) => {
      if (err) {
        console.error("Error fetching admins:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }
      console.log("Fetched admins:", { count: results.length });
      res.json({ success: true, users: results });
    }
  );
});

router.put("/users/:id", [isAuthenticatedAdmin, isAdmin], (req, res) => {
  const adminId = parseInt(req.params.id, 10);
  const { username, role } = req.body;

  if (!username || !role) {
    console.error("Missing fields for admin update ID:", adminId);
    return res.status(400).json({ success: false, error: "Username and role are required." });
  }

  if (!['Deputy Admin', 'Assistant Admin'].includes(role)) {
    console.error("Invalid role for admin update:", role);
    return res.status(400).json({ success: false, error: "Invalid role" });
  }

  db.query(
    "UPDATE admins SET username = ?, role = ? WHERE id = ?",
    [username, role, adminId],
    (err, result) => {
      if (err) {
        console.error("Error updating admin:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }
      if (result.affectedRows === 0) {
        console.error("No admin found for update ID:", adminId);
        return res.status(404).json({ success: false, error: "Admin not found." });
      }
      console.log("Admin updated:", { id: adminId });
      res.json({ success: true, message: "Admin updated successfully." });
    }
  );
});

router.delete("/users/:id", [isAuthenticatedAdmin, isAdmin], (req, res) => {
  const userId = parseInt(req.params.id, 10);

  if (req.session.adminId === userId) {
    return res.status(403).json({ success: false, error: "You cannot delete your own account while logged in." });
  }

  db.query("SELECT role FROM admins WHERE id = ?", [userId], (err, results) => {
    if (err) {
      console.error("Error checking admin:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    if (results.length === 0) {
      console.error("No admin found for deletion ID:", userId);
      return res.status(404).json({ success: false, error: "Admin not found" });
    }

    const role = results[0].role;
    if (["Admin", "SuperAdmin"].includes(role)) {
      return res.status(403).json({ success: false, error: "Cannot delete Admin or SuperAdmin accounts." });
    }

    db.query("DELETE FROM admins WHERE id = ?", [userId], (err, result) => {
      if (err) {
        console.error("Error deleting admin:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }
      if (result.affectedRows === 0) {
        console.error("No admin found for deletion ID:", userId);
        return res.status(404).json({ success: false, error: "Admin not found" });
      }
      console.log("Admin deleted:", { id: userId });
      res.json({ success: true, message: "Admin deleted successfully." });
    });
  });
});

// Staff management routes
router.get("/staff", isAuthenticatedAdmin, (req, res) => {
  db.query(
    "SELECT id, staff_id, first_name, last_name, email, phone, position FROM staff",
    (err, results) => {
      if (err) {
        console.error("Error fetching staff:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }
      console.log("Fetched staff:", { count: results.length });
      res.json({ success: true, staff: results });
    }
  );
});

router.post("/staff", [isAuthenticatedAdmin, isAdmin], (req, res) => {
  const { staff_id, first_name, last_name, email, phone, position } = req.body;
  if (!staff_id || !first_name || !last_name || !email || !position) {
    console.error("Missing fields for staff creation");
    return res.status(400).json({ success: false, error: "All required fields must be provided." });
  }
  db.query("SELECT id FROM positions WHERE name = ?", [position], (err, positionResults) => {
    if (err) {
      console.error("Error validating position:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    if (positionResults.length === 0) {
      console.error("Invalid position for staff creation:", position);
      return res.status(400).json({ success: false, error: "Invalid position" });
    }
    db.query(
      "INSERT INTO staff (staff_id, first_name, last_name, email, phone, position) VALUES (?, ?, ?, ?, ?, ?)",
      [staff_id, first_name, last_name, email, phone || null, position],
      (err, result) => {
        if (err) {
          console.error("Error adding staff:", err);
          return res.status(500).json({ success: false, error: "Database error" });
        }
        console.log("Staff added:", { id: result.insertId, staff_id });
        res.json({ success: true, message: "Staff added successfully." });
      }
    );
  });
});

router.get("/staff/:id", isAuthenticatedAdmin, (req, res) => {
  const staffId = parseInt(req.params.id, 10);
  db.query(
    "SELECT id, staff_id, first_name, last_name, email, phone, position FROM staff WHERE id = ?",
    [staffId],
    (err, results) => {
      if (err) {
        console.error("Error fetching staff:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }
      if (results.length === 0) {
        console.error("No staff found for ID:", staffId);
        return res.status(404).json({ success: false, error: "Staff not found" });
      }
      console.log("Fetched staff for edit:", { id: staffId });
      res.json({ success: true, staff: results[0] });
    }
  );
});

router.put("/staff/:id", [isAuthenticatedAdmin, isAdmin], (req, res) => {
  const staffId = parseInt(req.params.id, 10);
  const { staff_id, first_name, last_name, email, phone, position } = req.body;
  if (!staff_id || !first_name || !last_name || !email || !position) {
    console.error("Missing fields for staff update ID:", staffId);
    return res.status(400).json({ success: false, error: "All required fields must be provided." });
  }
  db.query("SELECT id FROM staff WHERE id = ?", [staffId], (err, staffResults) => {
    if (err) {
      console.error("Error checking staff existence:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    if (staffResults.length === 0) {
      console.error("No staff found for update ID:", staffId);
      return res.status(404).json({ success: false, error: "Staff not found." });
    }
    db.query("SELECT id FROM positions WHERE name = ?", [position], (err, positionResults) => {
      if (err) {
        console.error("Error validating position:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }
      if (positionResults.length === 0) {
        console.error("Invalid position for staff update:", position);
        return res.status(400).json({ success: false, error: "Invalid position" });
      }
      db.query(
        "UPDATE staff SET staff_id = ?, first_name = ?, last_name = ?, email = ?, phone = ?, position = ? WHERE id = ?",
        [staff_id, first_name, last_name, email, phone || null, position, staffId],
        (err, result) => {
          if (err) {
            console.error("Error updating staff:", err);
            return res.status(500).json({ success: false, error: "Database error" });
          }
          if (result.affectedRows === 0) {
            console.error("No staff updated for ID:", staffId);
            return res.status(404).json({ success: false, error: "Staff not found." });
          }
          console.log("Staff updated:", { id: staffId });
          res.json({ success: true, message: "Staff updated successfully." });
        }
      );
    });
  });
});

router.delete("/staff/:id", [isAuthenticatedAdmin, isAdmin], (req, res) => {
  const staffId = parseInt(req.params.id, 10);
  if (!staffId) {
    console.error("Invalid staff ID for deletion:", req.params.id);
    return res.status(400).json({ success: false, error: "Invalid staff ID" });
  }
  db.query("SELECT id FROM staff WHERE id = ?", [staffId], (err, staffResults) => {
    if (err) {
      console.error("Error checking staff existence:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    if (staffResults.length === 0) {
      console.error("No staff found for deletion ID:", staffId);
      return res.status(404).json({ success: false, error: "Staff not found" });
    }
    db.query("DELETE FROM staff_positions WHERE staff_id = ?", [staffId], (err) => {
      if (err && err.code !== 'ER_NO_SUCH_TABLE') {
        console.error("Error deleting staff positions:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }
      db.query("DELETE FROM staff WHERE id = ?", [staffId], (err, result) => {
        if (err) {
          console.error("Error deleting staff:", err);
          return res.status(500).json({ success: false, error: "Database error" });
        }
        if (result.affectedRows === 0) {
          console.error("No staff found for deletion ID:", staffId);
          return res.status(404).json({ success: false, error: "Staff not found" });
        }
        console.log("Staff deleted:", { id: staffId });
        res.json({ success: true, message: "Staff deleted successfully." });
      });
    });
  });
});

// Student management routes
router.post("/students", [isAuthenticatedAdmin, isAdmin], upload.single("profile_picture"), (req, res) => {
  const { admission_number, first_name, last_name, email, course_id, amount } = req.body;
  const profile_picture_url = req.file ? `/Uploads/${req.file.filename}` : null;
  if (!admission_number || !first_name || !last_name || !email || !course_id) {
    console.error("Missing fields for student creation");
    return res.status(400).json({ success: false, error: "All required fields must be provided." });
  }
  db.query("SELECT id FROM courses WHERE id = ?", [course_id], (err, courseResults) => {
    if (err) {
      console.error("Error validating course:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    if (courseResults.length === 0) {
      console.error("Invalid course_id for student creation:", course_id);
      return res.status(400).json({ success: false, error: "Invalid course ID" });
    }
    let query = "INSERT INTO students (admission_number, first_name, last_name, email, course_id, amount";
    const params = [admission_number, first_name, last_name, email, course_id, amount || null];
    if (profile_picture_url) {
      query += ", profile_picture";
      params.push(profile_picture_url);
    }
    query += ") VALUES (?, ?, ?, ?, ?, ?";
    if (profile_picture_url) query += ", ?";
    query += ")";
    db.query(query, params, (err, result) => {
      if (err) {
        console.error("Error adding student:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }
      console.log("Student added:", { id: result.insertId, admission_number });
      res.json({ success: true, message: "Student added successfully." });
    });
  });
});

router.get("/students", isAuthenticatedAdmin, (req, res) => {
  const courseId = req.query.courseId;
  let query = "SELECT s.id, s.admission_number, s.first_name, s.last_name, s.email, s.course_id, c.name AS course_name FROM students s JOIN courses c ON s.course_id = c.id";
  const params = [];
  if (courseId) {
    query += " WHERE s.course_id = ?";
    params.push(courseId);
  }
  query += " ORDER BY s.first_name, s.last_name";
  db.query(query, params, (err, results) => {
    if (err) {
      console.error("Error fetching students:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    console.log("Fetched students:", { count: results.length, courseId: courseId || "all" });
    res.json({ success: true, students: results });
  });
});

router.get("/students/:id", isAuthenticatedAdmin, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  db.query(
    "SELECT id, admission_number, first_name, last_name, email, course_id, amount, profile_picture FROM students WHERE id = ?",
    [studentId],
    (err, results) => {
      if (err) {
        console.error("Error fetching student:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }
      if (results.length === 0) {
        console.error("No student found for ID:", studentId);
        return res.status(404).json({ success: false, error: "Student not found" });
      }
      console.log("Fetched student for edit:", { id: studentId });
      res.json({ success: true, student: results[0] });
    }
  );
});

router.put("/students/:id", [isAuthenticatedAdmin, isAdmin], upload.single("profile_picture"), (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const { admission_number, first_name, last_name, email, course_id, amount } = req.body;
  const profile_picture_url = req.file ? `/Uploads/${req.file.filename}` : null;

  if (!admission_number || !first_name || !last_name || !email || !course_id) {
    console.error("Missing fields for student update ID:", studentId);
    return res.status(400).json({ success: false, error: "All required fields must be provided." });
  }

  db.query("SELECT id FROM courses WHERE id = ?", [course_id], (err, courseResults) => {
    if (err) {
      console.error("Error validating course:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    if (courseResults.length === 0) {
      console.error("Invalid course_id for student update:", course_id);
      return res.status(400).json({ success: false, error: "Invalid course ID" });
    }

    let query = "UPDATE students SET admission_number = ?, first_name = ?, last_name = ?, email = ?, course_id = ?, amount = ?";
    const params = [admission_number, first_name, last_name, email, course_id, amount || null];

    if (profile_picture_url) {
      query += ", profile_picture = ?";
      params.push(profile_picture_url);
    }
    query += " WHERE id = ?";
    params.push(studentId);

    db.query(query, params, (err, result) => {
      if (err) {
        console.error("Error updating student:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }
      if (result.affectedRows === 0) {
        console.error("No student found for update ID:", studentId);
        return res.status(404).json({ success: false, error: "Student not found." });
      }
      console.log("Student updated:", { id: studentId });
      res.json({ success: true, message: "Student updated successfully." });
    });
  });
});

router.delete("/students/:id", [isAuthenticatedAdmin, isAdmin], (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  if (!studentId) {
    console.error("Invalid student ID for deletion:", req.params.id);
    return res.status(400).json({ success: false, error: "Invalid student ID" });
  }
  db.query("SELECT id FROM students WHERE id = ?", [studentId], (err, studentResults) => {
    if (err) {
      console.error("Error checking student existence:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    if (studentResults.length === 0) {
      console.error("No student found for deletion ID:", studentId);
      return res.status(404).json({ success: false, error: "Student not found" });
    }
    db.query("DELETE FROM payments WHERE student_id = ?", [studentId], (err) => {
      if (err && err.code !== 'ER_NO_SUCH_TABLE') {
        console.error("Error deleting student payments:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }
      db.query("DELETE FROM assignment_submissions WHERE student_id = ?", [studentId], (err) => {
        if (err && err.code !== 'ER_NO_SUCH_TABLE') {
          console.error("Error deleting student submissions:", err);
          return res.status(500).json({ success: false, error: "Database error" });
        }
        db.query("DELETE FROM students WHERE id = ?", [studentId], (err, result) => {
          if (err) {
            console.error("Error deleting student:", err);
            return res.status(500).json({ success: false, error: "Database error" });
          }
          if (result.affectedRows === 0) {
            console.error("No student found for deletion ID:", studentId);
            return res.status(404).json({ success: false, error: "Student not found" });
          }
          console.log("Student deleted:", { id: studentId });
          res.json({ success: true, message: "Student deleted successfully." });
        });
      });
    });
  });
});

// Dashboard overview route
router.get("/dashboard-overview", isAuthenticatedAdmin, (req, res) => {
  const counts = {};
  const queries = {
    staffCount: "SELECT COUNT(*) AS count FROM staff",
    studentCount: "SELECT COUNT(*) AS count FROM students",
    courseCount: "SELECT COUNT(*) AS count FROM courses",
    paymentSummary:
      "SELECT SUM(amount) AS total_paid, SUM(CASE WHEN status = 'Pending' THEN amount ELSE 0 END) AS pending_payments FROM payments",
  };

  let completedQueries = 0;
  const totalQueries = Object.keys(queries).length;

  for (const key in queries) {
    db.query(queries[key], (err, result) => {
      if (err) {
        console.error(`Error fetching ${key}:`, err);
        return res.status(500).json({ success: false, error: "Database error" });
      }
      counts[key] = result[0] || {};
      completedQueries++;
      if (completedQueries === totalQueries) {
        console.log("Fetched dashboard overview:", counts);
        res.json({ success: true, data: counts });
      }
    });
  }
});

// Dashboard payments route
router.get("/dashboard/payments", isAuthenticatedAdmin, (req, res) => {
  db.query(
    `SELECT 
        p.id, 
        s.id AS student_id, 
        s.first_name, 
        s.last_name, 
        p.payment_type, 
        p.amount, 
        p.status, 
        p.payment_date
      FROM payments p
      JOIN students s ON p.student_id = s.id
      ORDER BY s.first_name, p.payment_date`,
    (err, results) => {
      if (err) {
        console.error("Error fetching payments:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }
      console.log("Fetched payments:", { count: results.length });
      res.json({ success: true, payments: results });
    }
  );
});

// Certificate generation route
router.get("/certificate/:studentId", isAuthenticatedAdmin, (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  db.query(
    `SELECT 
        s.first_name, 
        s.last_name, 
        c.name AS course_name, 
        AVG(asub.score / a.max_score) * 100 AS average_score
      FROM students s
      JOIN courses c ON s.course_id = c.id
      LEFT JOIN assignment_submissions asub ON asub.student_id = s.id
      LEFT JOIN assignments a ON asub.assignment_id = a.id
      WHERE s.id = ?
      GROUP BY s.id`,
    [studentId],
    (err, results) => {
      if (err) {
        console.error("Error generating certificate:", err);
        return res.status(500).json({ success: false, error: "Database error" });
      }
      if (results.length === 0 || (results[0].average_score && results[0].average_score < 50)) {
        console.error("Student not eligible for certificate:", {
          id: studentId,
          average_score: results[0]?.average_score,
        });
        return res.status(400).json({
          success: false,
          error: "Student not found or does not meet the 50% average score requirement.",
        });
      }

      const student = results[0];
      const doc = new PDFDocument();
      const studentFullName = `${student.first_name} ${student.last_name}`;
      const filename = `Certificate_of_${studentFullName.replace(/\s/g, "_")}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      doc.pipe(res);

      doc.fontSize(25).text("Certificate of Completion", { align: "center" }).moveDown();
      doc.fontSize(16).text("This is to certify that", { align: "center" }).moveDown();
      doc.fontSize(20).text(studentFullName.toUpperCase(), { align: "center" }).moveDown();
      doc
        .fontSize(16)
        .text(`has successfully completed the course "${student.course_name}".`, { align: "center" })
        .moveDown();
      doc.fontSize(12).text(`Dated: ${new Date().toLocaleDateString()}`, { align: "center" }).moveDown(3);

      const signatureImagePath = path.join(__dirname, "signature.jpg");
      if (fs.existsSync(signatureImagePath)) {
        doc.image(signatureImagePath, { align: "center", fit: [200, 100] });
      } else {
        doc.text("______________________", { align: "center" }).moveDown();
        doc.text("Authorized Signature", { align: "center" });
      }

      doc.end();
      console.log("Certificate generated for student:", { id: studentId });
    }
  );
});

// ID card generation route
router.get("/id-card/:entityId", isAuthenticatedAdmin, (req, res) => {
  const entityId = parseInt(req.params.entityId, 10);
  const entityType = req.query.type;
  const isStudent = entityType === "student";

  const query = isStudent
    ? `SELECT id, admission_number, first_name, last_name, course_id FROM students WHERE id = ?`
    : `SELECT id, staff_id, first_name, last_name, position FROM staff WHERE id = ?`;
  db.query(query, [entityId], (err, results) => {
    if (err) {
      console.error("Error generating ID card:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    if (results.length === 0) {
      console.error("Entity not found for ID card:", { id: entityId, type: entityType });
      return res.status(404).json({ success: false, error: "Entity not found." });
    }

    const entity = results[0];
    const doc = new PDFDocument({ layout: "landscape", size: [300, 200] });
    const entityFullName = `${entity.first_name} ${entity.last_name}`;
    const filename = `${entityFullName.replace(/\s/g, "_")}_ID_Card.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    doc.rect(0, 0, 300, 200).fill("#f0f4f8");
    doc.fillColor("black");
    doc.fontSize(14).text("ULTRA TECH INSTITUTE", 10, 10, { width: 280, align: "center" });
    doc.fontSize(10).text(isStudent ? "STUDENT ID CARD" : "STAFF ID CARD", { align: "center" });

    doc.fontSize(12).text(`ID: ${isStudent ? entity.admission_number : entity.staff_id}`, 10, 50);
    doc.text(`Name: ${entityFullName}`);
    doc.text(`Role: ${isStudent ? "Student" : entity.position}`);
    if (isStudent) {
      db.query("SELECT name FROM courses WHERE id = ?", [entity.course_id], (courseErr, courseResult) => {
        if (courseErr) {
          console.error("Error fetching course for ID card:", courseErr);
        }
        if (courseResult.length > 0) {
          doc.text(`Course: ${courseResult[0].name}`);
        }
        const signatureImagePath = path.join(__dirname, "signature.jpg");
        if (fs.existsSync(signatureImagePath)) {
          doc.image(signatureImagePath, 10, 140, { fit: [100, 50] });
        } else {
          doc.text("__________________", 10, 140);
          doc.text("Authorized Signature", 10, 155);
        }
        doc.end();
        console.log("ID card generated:", { id: entityId, type: entityType });
      });
    } else {
      const signatureImagePath = path.join(__dirname, "signature.jpg");
      if (fs.existsSync(signatureImagePath)) {
        doc.image(signatureImagePath, 10, 140, { fit: [100, 50] });
      } else {
        doc.text("__________________", 10, 140);
        doc.text("Authorized Signature", 10, 155);
      }
      doc.end();
      console.log("ID card generated:", { id: entityId, type: entityType });
    }
  });
});

// Logout route
router.post("/logout", (req, res) => {
  if (!req.session || !req.session.adminId) {
    return res.status(401).json({ success: false, error: "No active session to logout." });
  }
  req.session.destroy((err) => {
    if (err) {
      console.error("Error during logout:", err);
      return res.status(500).json({ success: false, error: "Failed to log out." });
    }
    console.log("Admin logged out successfully");
    res.json({ success: true, message: "Logged out successfully." });
  });
});

// Courses route (for student edit form)
router.get("/courses", isAuthenticatedAdmin, (req, res) => {
  db.query("SELECT id, name FROM courses ORDER BY name", (err, results) => {
    if (err) {
      console.error("Error fetching courses:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    console.log("Fetched courses:", { count: results.length });
    res.json({ success: true, courses: results });
  });
});

// Positions route (for staff edit form)
router.get("/positions", isAuthenticatedAdmin, (req, res) => {
  db.query("SELECT id, name FROM positions ORDER BY name", (err, results) => {
    if (err) {
      console.error("Error fetching positions:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    console.log("Fetched positions:", { count: results.length });
    res.json({ success: true, positions: results });
  });
});

// Authentication check route
router.get("/auth-check", isAuthenticatedAdmin, (req, res) => {
  res.json({ success: true, role: req.session.adminRole });
});

module.exports = router;

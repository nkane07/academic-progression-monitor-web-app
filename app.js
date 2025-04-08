
// Setup
const express = require("express");
const app = express();
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
const session = require("express-session");
const multer = require("multer");
const mysql = require("mysql2");
const csv = require("csv-parser");

// Multer

// Student profile image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "public/uploads"),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix);
  },
});
const upload = multer({ storage });

// Admin CSV uploads
const csvStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "public/uploads/csv"),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix);
  },
});
const uploadCSV = multer({ storage: csvStorage });

//connect to my academic progression database

const conn = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "academic_progression",
  port: "3306",
});

//middlewear

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

// Sessions
app.use(session({
  secret: "mysecretsessionkey",
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 600000 }, // 10 minutes
}));

// Global variables
app.use((req, res, next) => {
  res.locals.currentYear = new Date().getFullYear();
  res.locals.req = req;
  next();
});

// Message badge for student 
app.use((req, res, next) => {
  if (req.session && req.session.userRole === "student") {
    const unreadQuery = `
      SELECT COUNT(*) AS unreadCount
      FROM messages
      WHERE recipient_id = ? AND is_read = 0
    `;
    conn.query(unreadQuery, [req.session.userId], (err, result) => {
      res.locals.unreadCount = err ? 0 : result[0].unreadCount;
      next();
    });
  } else {
    res.locals.unreadCount = 0;
    next();
  }
});

//check admin or student login roles

function requireStudent(req, res, next) {
  if (req.session.userRole !== "student") return res.redirect("/");
  next();
}

function requireAdmin(req, res, next) {
  if (req.session.userRole !== "admin") return res.redirect("/");
  next();
}


// Login page
app.get("/", (req, res) => {
  res.render("login", { error: null });
});

// Login form 
app.post("/login", (req, res) => {
  const { userField: username, password } = req.body;

  const userQuery = "SELECT * FROM users WHERE username = ?";
  conn.query(userQuery, [username], (err, results) => {
    if (err) throw err;
    if (results.length === 0) {
      return res.render("login", { error: "User not found. Please try again." });
    }

    const user = results[0];

    bcrypt.compare(password, user.password_hash, (err, isMatch) => {
      if (err) throw err;

      if (!isMatch) {
        return res.render("login", { error: "Incorrect password. Please try again." });
      }

      req.session.userId = user.user_id;
      req.session.userRole = user.role;

      // Reset password
      if (user.force_password_reset) return res.redirect("/reset-password");

      // check role
      if (user.role === "student") {
        const nameQuery = "SELECT first_name, last_name FROM students WHERE user_id = ?";
        conn.query(nameQuery, [user.user_id], (err, studentResult) => {
          if (err) throw err;

          req.session.studentName = studentResult.length > 0
            ? `${studentResult[0].first_name} ${studentResult[0].last_name}`
            : "Student";

          res.redirect("/student");
        });

      } else if (user.role === "admin") {
        res.redirect("/admin");
      }
    });
  });
});

// ========================================================
// DASHBOARD ROUTES
// ========================================================

// Student Dashboard
app.get("/student", requireStudent, (req, res) => {
  const studentName = req.session.studentName || "Student";
  res.render("student_dashboard", { studentName });
});

// Admin Dashboard
app.get("/admin", requireAdmin, (req, res) => {
  res.render("admin_dashboard");
});

// Academic Data for a Student

function getStudentAcademicData(userId, callback) {
  const studentQuery = `
    SELECT student_number, pathway 
    FROM students 
    WHERE user_id = ?
  `;

  conn.query(studentQuery, [userId], (err, studentResult) => {
    if (err) return callback(err);
    if (studentResult.length === 0) return callback(null, null);

    const { student_number, pathway } = studentResult[0];

    const recordsQuery = `
      SELECT 
        e.academic_year,
        m.module_name,
        e.module_code,
        e.grade,
        e.grade_result,
        e.resit_grade,
        e.resit_result,
        e.credits_earned
      FROM enrollment e
      JOIN modules m ON e.module_code = m.module_code
      WHERE e.student_id = ?
    `;

    conn.query(recordsQuery, [student_number], (err, records) => {
      if (err) return callback(err);

      let totalCredits = 0;
      let totalGrade = 0;
      let gradedModules = 0;
      let failedModules = [];
      let resitModules = [];
      let coreFails = 0;
      let level1Credits = 0;

      const level1ModuleCodes = [
        "IFSY-123", "IFSY-125", "IFSY-126", "IFSY-127", "IFSY-128",
        "IFSY-129", "IFSY-130", "IFSY-131", "IFSY-132", "IFSY-133",
        "BSAS-102", "BSAS-109", "BSAS-112", "BSAS-113", "IFSY-124", "FINA-107"
      ];

      const attemptTracker = {};

      // Calculate totals
      records.forEach(record => {
        const grade = parseFloat(record.grade) || 0;
        const code = record.module_code;

        if (["pass", "pass capped"].includes(record.grade_result)) {
          totalCredits += record.credits_earned;
          if (level1ModuleCodes.includes(code)) {
            level1Credits += record.credits_earned;
          }
        }

        if (!["excused", "absent"].includes(record.grade_result)) {
          totalGrade += grade;
          gradedModules++;
        }

        if (["fail", "absent"].includes(record.grade_result)) {
          attemptTracker[code] = (attemptTracker[code] || 0) + 1;
          failedModules.push(record.module_name);
          resitModules.push(record.module_name);
        }

        if (record.grade_result === "excused") {
          resitModules.push(record.module_name);
        }
      });

      // academic level
      let requiredCredits = 120;
      let currentLevel = "L1";
      let currentLevelLabel = "Year 1";

      if (totalCredits >= 240) {
        requiredCredits = 360;
        currentLevel = "L3";
        currentLevelLabel = "Year 3";
      } else if (totalCredits >= 120) {
        requiredCredits = 240;
        currentLevel = "L2";
        currentLevelLabel = "Year 2";
      }

      // core modules based on pathway
      const coreModules =
        (pathway === "Information Systems" && currentLevel === "L2") ? ["IFSY-259", "IFSY-240"] :
        (pathway === "Business Data Analytics" && currentLevel === "L2") ? ["IFSY-257"] : [];

      records.forEach(record => {
        if (coreModules.includes(record.module_code) && ["fail", "absent"].includes(record.grade_result)) {
          coreFails++;
        }
      });

      const averageGrade = gradedModules ? (totalGrade / gradedModules).toFixed(2) : 0;

      // Progression decision
      let decision = (currentLevelLabel === "Year 3")
        ? "Progress to Final Year"
        : `Progress to Year ${parseInt(currentLevelLabel.split(" ")[1]) + 1}`;

      if (totalCredits < 100 || averageGrade < 40)
        decision = "Resit Required or Contact Advisor";

      if (coreFails > 0)
        decision = "Failed Core Module - Contact Advisor";

      if ((currentLevel === "L2" || currentLevel === "L3") && level1Credits < 120)
        decision = "Incomplete Year 1 Modules - Cannot Progress";

      const exceededAttempts = Object.values(attemptTracker).filter(count => count >= 4).length;
      if (exceededAttempts > 0)
        decision = "Exceeded Max Attempts - Contact Advisor";

      // academic data returned
      callback(null, {
        records,
        totalCredits,
        requiredCredits,
        averageGrade,
        failedModules,
        resitModules,
        decision,
        currentLevel
      });
    });
  });
}

// student grades
app.get("/student/grades", requireStudent, (req, res) => {
  const userId = req.session.userId;

  getStudentAcademicData(userId, (err, data) => {
    if (err) throw err;
    if (!data) return res.send("Student not found.");

    res.render("student_grades", {
      records: data.records,
      currentYear: new Date().getFullYear(),
    });
  });
});

//student progression

const { getAcademicYear } = require("./utils/dateHelpers");

app.get("/student/progression", requireStudent, (req, res) => {
  const userId = req.session.userId;
  const academicYear = getAcademicYear();

  getStudentAcademicData(userId, (err, data) => {
    if (err) throw err;
    if (!data) return res.send("Student not found.");

    // Check if progression decision already exists
    const checkQuery = `
      SELECT * FROM progression_decisions 
      WHERE student_id = ? AND academic_year = ?
    `;

    conn.query(checkQuery, [userId, academicYear], (err, result) => {
      if (err) throw err;

      // If no record exists, insert new system-generated decision
      if (result.length === 0) {
        const insertQuery = `
          INSERT INTO progression_decisions 
          (student_id, academic_year, decision_text, decision_date, notes)
          VALUES (?, ?, ?, NOW(), ?)
        `;
        conn.query(insertQuery, [userId, academicYear, data.decision, null], (err) => {
          if (err) throw err;
          console.log("Progression decision saved.");
        });
      }

      // Fetch the most recent decision - system or admin manual override
      const fetchDecisionQuery = `
        SELECT decision_text, notes 
        FROM progression_decisions 
        WHERE student_id = ? AND academic_year = ?
        ORDER BY decision_date DESC
        LIMIT 1
      `;

      conn.query(fetchDecisionQuery, [userId, academicYear], (err, decisionResults) => {
        if (err) throw err;

        const finalDecision = decisionResults.length > 0 
          ? decisionResults[0].decision_text 
          : data.decision;

        const adminNote = decisionResults.length > 0 
          ? decisionResults[0].notes 
          : null;

        res.render("student_progression", {
          totalCredits: data.totalCredits,
          requiredCredits: data.requiredCredits,
          averageGrade: data.averageGrade,
          failedModules: data.failedModules,
          resitModules: data.resitModules,
          decision: finalDecision,
          adminNote,
          currentLevel: data.currentLevel,
          academicYear,
          currentYear: new Date().getFullYear()
        });
      });
    });
  });
});

// student profile

app.get("/student/profile", requireStudent, (req, res) => {
  const userId = req.session.userId;

  // get student details
  const studentQuery = `SELECT * FROM students WHERE user_id = ?`;

  conn.query(studentQuery, [userId], (err, studentResult) => {
    if (err) throw err;
    if (studentResult.length === 0) return res.send("Student not found.");

    const student = studentResult[0];

    // Calculate total credits
    const creditsQuery = `
      SELECT SUM(credits_earned) AS total_credits 
      FROM enrollment 
      WHERE student_id = ? AND grade_result IN ('pass', 'pass capped')
    `;

    conn.query(creditsQuery, [student.student_number], (err, creditResult) => {
      if (err) throw err;

      const totalCredits = creditResult[0].total_credits || 0;

      let currentLevel = "Year 1";
      let currentYearDisplay = 1;

      if (totalCredits >= 240) {
        currentLevel = "Year 3";
        currentYearDisplay = 3;
      } else if (totalCredits >= 120) {
        currentLevel = "Year 2";
        currentYearDisplay = 2;
      }

      // Render profile
      res.render("student_profile", {
        student: { ...student, current_level: currentLevel },
        currentYearDisplay,
        cleared: req.query.cleared
      });
    });
  });
});


// student messages

// inbox and sent messages
app.get("/student/messages", requireStudent, (req, res) => {
  const userId = req.session.userId;
  const box = req.query.box || "inbox";
  const search = req.query.search || "";
  const searchLike = `%${search}%`;

  let query, params;

  if (box === "sent") {
    query = `
      SELECT m.message_id, m.subject, m.body, m.sent_at, m.is_read, u.username AS recipient_name
      FROM messages m
      JOIN users u ON m.recipient_id = u.user_id
      WHERE m.sender_id = ?
      AND (m.subject LIKE ? OR u.username LIKE ?)
      ORDER BY m.sent_at DESC
    `;
    params = [userId, searchLike, searchLike];
  } else {
    query = `
      SELECT m.message_id, m.subject, m.body, m.sent_at, m.is_read, u.username AS sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.user_id
      WHERE m.recipient_id = ?
      AND (m.subject LIKE ? OR u.username LIKE ?)
      ORDER BY m.sent_at DESC
    `;
    params = [userId, searchLike, searchLike];
  }

  conn.query(query, params, (err, results) => {
    if (err) throw err;
    res.render("student_messages", {
      messages: results,
      box,
      search,
      req
    });
  });
});

// new message
app.get("/student/messages/contact", requireStudent, (req, res) => {
  res.render("student_compose_message", { req });
});

// View messages and replies
app.get("/student/messages/:id", requireStudent, (req, res) => {
  const userId = req.session.userId;
  const messageId = req.params.id;

  const messageQuery = `
    SELECT m.*, u.username AS sender_name 
    FROM messages m 
    JOIN users u ON m.sender_id = u.user_id 
    WHERE (m.recipient_id = ? OR m.sender_id = ?) AND m.message_id = ?
  `;

  conn.query(messageQuery, [userId, userId, messageId], (err, result) => {
    if (err) throw err;
    if (result.length === 0) return res.send("Message not found.");

    const message = result[0];

    // Mark as read
    if (message.recipient_id === userId) {
      conn.query(`UPDATE messages SET is_read = 1 WHERE message_id = ?`, [messageId]);
    }

    const repliesQuery = `
      SELECT m.*, u.username AS sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.user_id
      WHERE m.parent_message_id = ?
      ORDER BY sent_at ASC
    `;

    conn.query(repliesQuery, [messageId], (err, replies) => {
      if (err) throw err;

      res.render("student_view_message", {
        message,
        replies,
        req
      });
    });
  });
});

// Reply to a message
app.post("/student/messages/reply", requireStudent, (req, res) => {
  const senderId = req.session.userId;
  const { parent_id, body } = req.body;

  const recipientQuery = `SELECT sender_id FROM messages WHERE message_id = ?`;

  conn.query(recipientQuery, [parent_id], (err, results) => {
    if (err) throw err;
    if (results.length === 0) return res.send("Original message not found.");

    const recipientId = results[0].sender_id;

    const insertQuery = `
      INSERT INTO messages (sender_id, recipient_id, subject, body, sent_at, is_read, parent_message_id)
      VALUES (?, ?, 'Re: (reply)', ?, NOW(), 0, ?)
    `;

    conn.query(insertQuery, [senderId, recipientId, body, parent_id], (err) => {
      if (err) throw err;
      res.redirect("/student/messages/" + parent_id + "?reply_sent=1");
    });
  });
});

// Delete Message
app.post("/student/messages/:id/delete", requireStudent, (req, res) => {
  const messageId = req.params.id;
  const userId = req.session.userId;

  const deleteQuery = `
    DELETE FROM messages
    WHERE message_id = ? AND recipient_id = ?
  `;

  conn.query(deleteQuery, [messageId, userId], (err) => {
    if (err) throw err;
    res.redirect("/student/messages");
  });
});

// Send Message to admin
app.post("/student/messages/contact", requireStudent, (req, res) => {
  const userId = req.session.userId;
  const { subject, body } = req.body;

  const advisorQuery = `
    SELECT user_id FROM users WHERE username = 'admin2' LIMIT 1
  `;

  conn.query(advisorQuery, (err, results) => {
    if (err) throw err;
    if (results.length === 0) return res.send("Advisor not found.");

    const advisorId = results[0].user_id;

    const insertQuery = `
      INSERT INTO messages (sender_id, recipient_id, subject, body, sent_at, is_read)
      VALUES (?, ?, ?, ?, NOW(), 0)
    `;

    conn.query(insertQuery, [userId, advisorId, subject, body], (err) => {
      if (err) throw err;
      res.redirect("/student/messages/contact?sent=1");
    });
  });
});


//student profile - update

app.post("/student/profile/update", requireStudent, upload.single("profile_image"), (req, res) => {
  const userId = req.session.userId;
  const { secondary_email } = req.body;
  const profileImage = req.file ? `/uploads/${req.file.filename}` : null;

  const selectQuery = `
    SELECT profile_image, secondary_email 
    FROM students 
    WHERE user_id = ?
  `;

  conn.query(selectQuery, [userId], (err, results) => {
    if (err) throw err;

    const current = results[0];
    const finalImage = profileImage || current.profile_image;
    const finalEmail = secondary_email || current.secondary_email;

    const updateQuery = `
      UPDATE students 
      SET profile_image = ?, secondary_email = ? 
      WHERE user_id = ?
    `;

    conn.query(updateQuery, [finalImage, finalEmail, userId], (err) => {
      if (err) throw err;
      res.redirect("/student/profile");
    });
  });
});


// admn messages - send

// send message form
app.get("/admin/messages/new", requireAdmin, (req, res) => {
  const query = `
    SELECT u.user_id, s.student_number, s.first_name, s.last_name
    FROM users u
    JOIN students s ON u.user_id = s.user_id
    WHERE u.role = 'student'
  `;

  conn.query(query, (err, students) => {
    if (err) throw err;
    res.render("admin_send_message", { students, req });
  });
});

// Send message individual student or group
app.post("/admin/messages/send", requireAdmin, (req, res) => {
  const senderId = req.session.userId;
  const { filter_type, recipient_id, subject, body, pathway, year } = req.body;

  if (filter_type === "individual") {
    const query = `
      INSERT INTO messages (sender_id, recipient_id, subject, body, sent_at, is_read)
      VALUES (?, ?, ?, ?, NOW(), 0)
    `;
    conn.query(query, [senderId, recipient_id, subject, body], (err) => {
      if (err) throw err;
      res.redirect("/admin/messages/new?sent=1");
    });

  } else if (filter_type === "group") {
    const level = parseInt(year);

    const groupQuery = `
      SELECT u.user_id
      FROM users u
      JOIN students s ON u.user_id = s.user_id
      JOIN (
        SELECT student_id, SUM(credits_earned) AS total_credits
        FROM enrollment
        WHERE grade_result IN ('pass', 'pass capped')
        GROUP BY student_id
      ) AS totals ON s.student_number = totals.student_id
      WHERE u.role = 'student'
        AND s.pathway = ?
        AND (
          (? = 1 AND totals.total_credits < 120) OR
          (? = 2 AND totals.total_credits >= 120 AND totals.total_credits < 240) OR
          (? = 3 AND totals.total_credits >= 240)
        )
    `;

    conn.query(groupQuery, [pathway, level, level, level], (err, students) => {
      if (err) throw err;
      if (students.length === 0) return res.send("No matching students found.");

      const values = students.map(s => [
        senderId,
        s.user_id,
        subject,
        body,
        new Date(),
        0
      ]);

      const insertQuery = `
        INSERT INTO messages (sender_id, recipient_id, subject, body, sent_at, is_read)
        VALUES ?
      `;

      conn.query(insertQuery, [values], (err) => {
        if (err) throw err;
        res.redirect("/admin?sent=1");
      });
    });
  }
});


// admin - see students

app.get("/admin/students", requireAdmin, (req, res) => {
  const search = req.query.search || "";
  const likeSearch = `%${search}%`;
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  const query = `
    SELECT 
      s.student_number,
      s.first_name,
      s.last_name,
      s.pathway,
      s.user_id,
      SUM(e.credits_earned) AS total_credits
    FROM students s
    LEFT JOIN enrollment e ON s.student_number = e.student_id
    WHERE LOWER(s.first_name) LIKE LOWER(?) OR LOWER(s.last_name) LIKE LOWER(?)
    GROUP BY s.student_number
    LIMIT ? OFFSET ?
  `;

  conn.query(query, [likeSearch, likeSearch, limit, offset], (err, results) => {
    if (err) throw err;

    const students = results.map((s) => {
      let level = "Year 1";
      if (s.total_credits >= 240) level = "Year 3";
      else if (s.total_credits >= 120) level = "Year 2";
      return { ...s, level };
    });

    const countQuery = `
      SELECT COUNT(DISTINCT s.student_number) AS count
      FROM students s
      LEFT JOIN enrollment e ON s.student_number = e.student_id
      WHERE LOWER(s.first_name) LIKE LOWER(?) OR LOWER(s.last_name) LIKE LOWER(?)
    `;

    conn.query(countQuery, [likeSearch, likeSearch], (err, countResult) => {
      if (err) throw err;

      const totalStudents = countResult[0].count;
      const totalPages = Math.ceil(totalStudents / limit);

      res.render("admin_students", {
        students,
        req,
        currentPage: page,
        totalPages,
        search,
      });
    });
  });
});


// admin - add new student

app.get("/admin/students/new", requireAdmin, (req, res) => {
  const year = new Date().getFullYear().toString().slice(-2);
  const prefix = "IFSY";
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  const studentNumber = `${year}-${prefix}-${randomNum}`;

  res.render("admin_add_student", { req, studentNumber });
});

app.post("/admin/students/new", requireAdmin, (req, res) => {
  const { first_name, last_name, pathway, level } = req.body;

  const pathwayCodes = {
    "Information Systems": "IFSY",
    "Business Data Analytics": "BSAS",
  };

  const yearPrefix = new Date().getFullYear().toString().slice(-2);
  const pathwayCode = pathwayCodes[pathway] || "GEN";
  const randomDigits = Math.floor(100000 + Math.random() * 900000);
  const student_number = `${yearPrefix}-${pathwayCode}-${randomDigits}`;

  const defaultPassword = "studentpass";

  const userQuery = `
    INSERT INTO users (username, password_hash, role)
    VALUES (?, ?, 'student')
  `;

  bcrypt.hash(defaultPassword, 10, (err, hash) => {
    if (err) throw err;

    conn.query(userQuery, [student_number, hash], (err, userResult) => {
      if (err) throw err;

      const userId = userResult.insertId;

      const studentQuery = `
        INSERT INTO students (user_id, student_number, first_name, last_name, pathway, current_year)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      conn.query(
        studentQuery,
        [userId, student_number, first_name, last_name, pathway, level],
        (err) => {
          if (err) throw err;
          res.redirect("/admin/students?added=1");
        }
      );
    });
  });
});


// admin manage student

app.get("/admin/students/:id", requireAdmin, (req, res) => {
  const userId = req.params.id;

  const query = `
    SELECT s.*, u.username 
    FROM students s
    JOIN users u ON u.user_id = s.user_id
    WHERE s.user_id = ?
  `;

  conn.query(query, [userId], (err, result) => {
    if (err) throw err;
    if (result.length === 0) return res.send("Student not found.");

    const student = result[0];
    res.render("admin_manage_student", { student, req });
  });
});

app.post("/admin/students/:id/update", requireAdmin, (req, res) => {
  const userId = req.params.id;
  const { first_name, last_name, student_number, pathway, current_year } = req.body;

  const query = `
    UPDATE students 
    SET first_name = ?, last_name = ?, student_number = ?, pathway = ?, current_year = ? 
    WHERE user_id = ?
  `;

  conn.query(
    query,
    [first_name, last_name, student_number, pathway, current_year, userId],
    (err) => {
      if (err) throw err;
      res.redirect("/admin/students/" + userId + "?updated=1");
    }
  );
});

app.post("/admin/students/:id/delete", requireAdmin, (req, res) => {
  const userId = req.params.id;

  const query = `
    DELETE FROM students
    WHERE user_id = ?
  `;

  conn.query(query, [userId], (err) => {
    if (err) throw err;
    res.redirect("/admin/students?deleted=1");
  });
});


app.get("/admin/grades", requireAdmin, (req, res) => {
  const search = req.query.search || "";
  const likeSearch = `%${search}%`;

  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  const query = `
    SELECT e.enrollment_id, e.student_id, e.module_code, e.grade, e.grade_result, e.credits_earned,
           s.first_name, s.last_name
    FROM enrollment e
    LEFT JOIN students s ON e.student_id = s.student_number
    WHERE 
      e.student_id LIKE ? 
      OR e.module_code LIKE ? 
      OR s.first_name LIKE ? 
      OR s.last_name LIKE ?
    ORDER BY e.enrollment_id DESC
    LIMIT ? OFFSET ?
  `;

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM enrollment e
    LEFT JOIN students s ON e.student_id = s.student_number
    WHERE 
      e.student_id LIKE ? 
      OR e.module_code LIKE ? 
      OR s.first_name LIKE ? 
      OR s.last_name LIKE ?
  `;

  conn.query(
    query,
    [likeSearch, likeSearch, likeSearch, likeSearch, limit, offset],
    (err, grades) => {
      if (err) throw err;

      conn.query(
        countQuery,
        [likeSearch, likeSearch, likeSearch, likeSearch],
        (err, countResult) => {
          if (err) throw err;

          const totalGrades = countResult[0].total;
          const totalPages = Math.ceil(totalGrades / limit);

          res.render("admin_manage_grades", {
            grades,
            search,
            currentPage: page,
            totalPages,
            req,
          });
        }
      );
    }
  );
});

// admin update grades
app.post("/admin/grades/:id/update", requireAdmin, (req, res) => {
  const id = req.params.id;
  const { grade, result, credits } = req.body;

  const query = `
    UPDATE enrollment 
    SET grade = ?, grade_result = ?, credits_earned = ? 
    WHERE enrollment_id = ?
  `;

  conn.query(query, [grade, result, credits, id], (err) => {
    if (err) throw err;
    res.redirect("/admin/grades");
  });
});

// Admin CSV upload

app.get("/admin/upload-csv", requireAdmin, (req, res) => {
  const previewQuery = `
    SELECT * 
    FROM enrollment 
    ORDER BY enrollment_id DESC 
    LIMIT 10
  `;

  conn.query(previewQuery, (err, recentGrades) => {
    if (err) throw err;

    res.render("admin_upload_csv", {
      uploadSuccess: req.query.success,
      currentYear: new Date().getFullYear(),
      recentGrades,
      req
    });
  });
});


// admin csv grade upload

app.post("/admin/upload-grades", requireAdmin, uploadCSV.single("csvFile"), (req, res) => {
  if (!req.file) return res.send("No file uploaded.");

  const results = [];
  let successfulInserts = 0;
  const failedRows = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (row) => {
      if (
        !row.student_id ||
        !row.module_code ||
        !row.grade_result ||
        isNaN(row.credits_earned)
      ) {
        failedRows.push(row);
      } else {
        results.push(row);
      }
    })
    .on("end", () => {
      const insertQuery = `
        INSERT INTO enrollment (student_id, module_code, grade, grade_result, credits_earned)
        VALUES (?, ?, ?, ?, ?)
      `;

      results.forEach((r) => {
        conn.query(
          insertQuery,
          [r.student_id, r.module_code, r.grade, r.grade_result, r.credits_earned],
          (err) => {
            if (!err) successfulInserts++;
          }
        );
      });

      fs.unlink(req.file.path, () => {
        res.redirect(`/admin/upload-csv?success=1&count=${successfulInserts}&errors=${failedRows.length}`);
      });
    });
});


// ========================================================
// ADMIN - VIEW MODULES
// ========================================================

app.get("/admin/modules", requireAdmin, (req, res) => {
  const search = req.query.search || "";
  const likeSearch = `%${search}%`;
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  const query = `
    SELECT * FROM modules
    WHERE module_code LIKE ? OR module_name LIKE ?
    ORDER BY module_code
    LIMIT ? OFFSET ?
  `;

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM modules
    WHERE module_code LIKE ? OR module_name LIKE ?
  `;

  conn.query(query, [likeSearch, likeSearch, limit, offset], (err, modules) => {
    if (err) throw err;

    conn.query(countQuery, [likeSearch, likeSearch], (err, countResult) => {
      if (err) throw err;

      const totalModules = countResult[0].total;
      const totalPages = Math.ceil(totalModules / limit);

      res.render("admin_modules", {
        modules,
        search,
        totalModules,
        currentPage: page,
        totalPages,
        req,
      });
    });
  });
});


//admin - add module

// Add module form
app.get("/admin/modules/new", requireAdmin, (req, res) => {
  res.render("admin_add_module", { req });
});

// Add module to database
app.post("/admin/modules/new", requireAdmin, (req, res) => {
  const {
    module_name,
    module_code,
    credit_value,
    degree_programme_code,
    semester,
  } = req.body;

  const checkQuery = `
    SELECT * FROM modules WHERE module_code = ?
  `;

  conn.query(checkQuery, [module_code], (err, existing) => {
    if (err) throw err;

    if (existing.length > 0) {
      return res.redirect("/admin/modules/new?duplicate=1");
    }

    const insertQuery = `
      INSERT INTO modules (module_name, module_code, credit_value, degree_programme_code, semester)
      VALUES (?, ?, ?, ?, ?)
    `;

    conn.query(
      insertQuery,
      [module_name, module_code, credit_value, degree_programme_code, semester],
      (err) => {
        if (err) throw err;
        res.redirect("/admin/modules?added=1");
      }
    );
  });
});

// admin edit modules

app.get("/admin/modules/:id/edit", requireAdmin, (req, res) => {
  const id = req.params.id;

  const query = `
    SELECT * 
    FROM modules 
    WHERE module_id = ?
  `;

  conn.query(query, [id], (err, result) => {
    if (err) throw err;
    if (result.length === 0) return res.send("Module not found.");

    res.render("admin_edit_module", {
      module: result[0],
      currentYear: new Date().getFullYear()
    });
  });
});

// admin update modules

app.post("/admin/modules/:id/update", requireAdmin, (req, res) => {
  const id = req.params.id;
  const {
    module_name,
    module_code,
    credit_value,
    degree_programme_code,
    semester
  } = req.body;

  const updateQuery = `
    UPDATE modules 
    SET module_name = ?, module_code = ?, credit_value = ?, 
        degree_programme_code = ?, semester = ?
    WHERE module_id = ?
  `;

  conn.query(updateQuery, [
    module_name,
    module_code,
    credit_value,
    degree_programme_code,
    semester,
    id
  ], (err) => {
    if (err) throw err;
    res.redirect("/admin/modules?updated=1");
  });
});

// admin delete modules

app.post("/admin/modules/:id/delete", requireAdmin, (req, res) => {
  const id = req.params.id;

  const deleteQuery = `
    DELETE FROM modules 
    WHERE module_id = ?
  `;

  conn.query(deleteQuery, [id], (err) => {
    if (err) throw err;
    res.redirect("/admin/modules?deleted=1");
  });
});

// admin reports

app.get("/admin/reports", requireAdmin, (req, res) => {
  const selectedLevel = req.query.level || "all";
  const selectedPathway = req.query.pathway || "all";
  const stats = {};

  // level filter
  let levelCondition = "";
  if (selectedLevel === "1") {
    levelCondition = `HAVING total_credits < 120`;
  } else if (selectedLevel === "2") {
    levelCondition = `HAVING total_credits >= 120 AND total_credits < 240`;
  } else if (selectedLevel === "3") {
    levelCondition = `HAVING total_credits >= 240`;
  }

  // student totals and av grade
  const studentCreditQuery = `
    SELECT 
      s.student_number,
      s.pathway,
      SUM(CASE WHEN e.grade_result IN ('pass', 'pass capped') THEN e.credits_earned ELSE 0 END) AS total_credits,
      AVG(CASE WHEN e.grade_result NOT IN ('excused', 'absent') THEN e.grade ELSE NULL END) AS avg_grade
    FROM students s
    JOIN enrollment e ON s.student_number = e.student_id
    ${selectedPathway !== "all" ? "WHERE s.pathway = " + conn.escape(selectedPathway) : ""}
    GROUP BY s.student_number
    ${levelCondition}
  `;

  conn.query(studentCreditQuery, (err, studentData) => {
    if (err) throw err;

    // progression summary
    const progressionSummary = {};
    studentData.forEach((s) => {
      if (!progressionSummary[s.pathway]) {
        progressionSummary[s.pathway] = { total: 0, progressing: 0 };
      }

      progressionSummary[s.pathway].total++;

      if (s.total_credits >= 100 && s.avg_grade >= 40) {
        progressionSummary[s.pathway].progressing++;
      }
    });
    stats.progressionSummary = progressionSummary;

    // skip query if no students
    if (studentData.length === 0) {
      stats.pathwayStats = [];
      stats.failedModules = [];
      return res.render("admin_reports", {
        stats,
        req,
        selectedLevel,
        selectedPathway
      });
    }

    // student id list
    const studentIds = studentData.map((s) => `'${s.student_number}'`).join(",");

    // pathway stats
    const pathwayStatsQuery = `
      SELECT 
        s.pathway, 
        COUNT(*) AS total_students,
        SUM(CASE WHEN e.grade_result IN ('pass', 'pass capped') THEN 1 ELSE 0 END) AS passed_modules,
        AVG(e.grade) AS avg_grade
      FROM students s
      JOIN enrollment e ON s.student_number = e.student_id
      WHERE s.student_number IN (${studentIds})
      GROUP BY s.pathway
    `;

    conn.query(pathwayStatsQuery, (err, pathwayStats) => {
      if (err) throw err;
      stats.pathwayStats = pathwayStats;

      // failed modules
      const failedModulesQuery = `
        SELECT 
          e.module_code, 
          m.module_name, 
          COUNT(*) AS fails 
        FROM enrollment e
        JOIN modules m ON e.module_code = m.module_code
        WHERE e.grade_result = 'fail'
        GROUP BY e.module_code
        ORDER BY fails DESC
        LIMIT 5
      `;

      conn.query(failedModulesQuery, (err, failedModules) => {
        if (err) throw err;
        stats.failedModules = failedModules;

        // resit modules
        const resitModulesQuery = `
          SELECT 
            e.module_code, 
            m.module_name, 
            COUNT(*) AS resit_count
          FROM enrollment e
          JOIN modules m ON e.module_code = m.module_code
          WHERE e.resit_result IS NOT NULL AND e.resit_result != ''
          GROUP BY e.module_code
          ORDER BY resit_count DESC
          LIMIT 5
        `;

        conn.query(resitModulesQuery, (err, resitStats) => {
          if (err) throw err;
          stats.resitStats = resitStats;

          // render
          res.render("admin_reports", {
            stats,
            req,
            selectedLevel,
            selectedPathway
          });
        });
      });
    });
  });
});

// admin student summary

app.get("/admin/students/:id/summary", requireAdmin, (req, res) => {
  const userId = req.params.id;

  // get student info
  const studentQuery = `
    SELECT s.*, u.username 
    FROM students s 
    JOIN users u ON s.user_id = u.user_id 
    WHERE s.user_id = ?
  `;

  conn.query(studentQuery, [userId], (err, studentResult) => {
    if (err) throw err;
    if (studentResult.length === 0) return res.send("Student not found.");

    const student = studentResult[0];
    const manualDecision = student.manual_decision;

    // get grades and modules
    const gradesQuery = `
      SELECT 
        e.academic_year,
        m.module_name,
        e.module_code,
        e.grade,
        e.grade_result,
        e.resit_grade,
        e.resit_result,
        e.credits_earned
      FROM enrollment e
      JOIN modules m ON e.module_code = m.module_code
      WHERE e.student_id = ?
    `;

    conn.query(gradesQuery, [student.student_number], (err, records) => {
      if (err) throw err;

      let totalCredits = 0;
      let totalGrade = 0;
      let gradedModules = 0;
      let failedModules = [];
      let resitModules = [];
      let attemptTracker = {};
      let coreFails = [];

      // module records
      records.forEach((record) => {
        const grade = parseFloat(record.grade) || 0;

        if (["pass", "pass capped"].includes(record.grade_result)) {
          totalCredits += record.credits_earned;
        }

        if (!["excused", "absent"].includes(record.grade_result)) {
          totalGrade += grade;
          gradedModules++;
        }

        if (["fail", "absent"].includes(record.grade_result)) {
          attemptTracker[record.module_code] = (attemptTracker[record.module_code] || 0) + 1;
          failedModules.push(record.module_name);
          resitModules.push(record.module_name);
        }

        if (record.grade_result === "excused") {
          resitModules.push(record.module_name);
        }
      });

      // required amount of credits
      let requiredCredits = 120;
      if (totalCredits >= 240) {
        requiredCredits = 360;
      } else if (totalCredits >= 120) {
        requiredCredits = 240;
      }

      //failed core modules
      const coreModules = 
        student.pathway === "Information Systems"
          ? ["IFSY-259", "IFSY-240"]
          : student.pathway === "Business Data Analytics"
          ? ["IFSY-257"]
          : [];

      records.forEach((record) => {
        if (coreModules.includes(record.module_code) && ["fail", "absent"].includes(record.grade_result)) {
          coreFails.push(record.module_name);
        }
      });

      // average calc
      const exceededAttempts = Object.entries(attemptTracker)
        .filter(([_, count]) => count >= 4)
        .map(([code]) => code);

      const averageGrade = gradedModules ? (totalGrade / gradedModules).toFixed(2) : 0;

      // work out progression decision
      let decision = "Progression decision pending";

      if (coreFails.length > 0) {
        decision = "Failed Core Module - Review Needed";
      } else if (exceededAttempts.length > 0) {
        decision = "Max Attempts Reached - Review Required";
      } else if (totalCredits >= 100 && averageGrade >= 40) {
        decision = "Eligible to Progress";
      } else {
        decision = "Progression Denied - Insufficient Credits or Grades";
      }

      // progression decision history
      const historyQuery = `
        SELECT academic_year, decision_text, decision_date, notes
        FROM progression_decisions
        WHERE student_id = ?
        ORDER BY decision_date DESC
      `;

      conn.query(historyQuery, [userId], (err, progressionHistory) => {
        if (err) throw err;

        // render
        res.render("admin_student_summary", {
          student,
          records,
          totalCredits,
          averageGrade,
          failedModules,
          resitModules,
          coreFails,
          exceededAttempts,
          decision,
          manualDecision,
          req,
          requiredCredits,
          progressionHistory
        });
      });
    });
  });
});

// admin override progression decision

app.post("/admin/students/:id/override-decision", requireAdmin, (req, res) => {
  const userId = req.params.id;
  const { manual_decision } = req.body;
  const academicYear = getAcademicYear();
  const overrideNote = "Manual override by admin";

  //override into progression_decisions
  
  const upsertQuery = `
    INSERT INTO progression_decisions 
      (student_id, academic_year, decision_text, decision_date, notes)
    VALUES (?, ?, ?, NOW(), ?)
    ON DUPLICATE KEY UPDATE
      decision_text = VALUES(decision_text),
      decision_date = NOW(),
      notes = VALUES(notes)
  `;

  conn.query(upsertQuery, [userId, academicYear, manual_decision, overrideNote], (err) => {
    if (err) throw err;

    // Update manual decision on student profile
    
    const updateStudentQuery = `
      UPDATE students 
      SET manual_decision = ? 
      WHERE user_id = ?
    `;

    conn.query(updateStudentQuery, [manual_decision, userId], (err) => {
      if (err) throw err;
      res.redirect(`/admin/students/${userId}/summary`);
    });
  });
});
// login - forgot username

// form
app.get("/forgot-username", (req, res) => {
  res.render("forgot_username", { username: null, error: null });
});

app.post("/forgot-username", (req, res) => {
  const email = req.body.email;

  const query = `
    SELECT username
    FROM users
    WHERE email = ?
      OR user_id IN (
        SELECT user_id FROM students WHERE contact_email = ?
      )
  `;

  conn.query(query, [email, email], (err, result) => {
    if (err) throw err;

    if (result.length === 0) {
      return res.render("forgot_username", {
        username: null,
        error: "Email not found."
      });
    }

    const username = result[0].username;

    res.render("forgot_username", {
      username,
      error: null
    });
  });
});

// login - forgot password

// reset form
app.get("/forgot-password", (req, res) => {
  res.render("forgot_password", {
    success: null,
    error: null
  });
});

//reset request
app.post("/forgot-password", async (req, res) => {
  const email = req.body.email;

  const query = `
    SELECT u.user_id, u.username
    FROM users u
    LEFT JOIN students s ON u.user_id = s.user_id
    WHERE u.email = ? OR s.contact_email = ?
  `;

  conn.query(query, [email, email], async (err, results) => {
    if (err) throw err;

    if (results.length === 0) {
      return res.render("forgot_password", {
        error: "Email not found.",
        success: null
      });
    }

    const user = results[0];
    const tempPassword = "Temp" + Math.floor(100000 + Math.random() * 900000);
    const hashed = await bcrypt.hash(tempPassword, 10);

    const updateQuery = `
      UPDATE users 
      SET password_hash = ?, force_password_reset = 1 
      WHERE user_id = ?
    `;

    conn.query(updateQuery, [hashed, user.user_id], (err) => {
      if (err) throw err;

      res.render("forgot_password", {
        success: "A temporary password has been generated. Please check your email or contact support.",
        error: null
      });

      console.log(`TEMP password for ${user.username}: ${tempPassword}`);
    });
  });
});

// reset password form - appear after using temp password from terminal

// Render reset form
app.get("/reset-password", (req, res) => {
  if (!req.session.userId) return res.redirect("/");
  res.render("reset_password", {
    error: null,
    success: null
  });
});

// Handle reset form submission
app.post("/reset-password", async (req, res) => {
  if (!req.session.userId) return res.redirect("/");

  const { new_password, confirm_password } = req.body;

  // Passwords must match
  if (new_password !== confirm_password) {
    return res.render("reset_password", {
      error: "Passwords do not match.",
      success: null
    });
  }

  // Hash and update password
  const hashed = await bcrypt.hash(new_password, 10);

  const updateQuery = `
    UPDATE users 
    SET password_hash = ?, force_password_reset = 0
    WHERE user_id = ?
  `;

  conn.query(updateQuery, [hashed, req.session.userId], (err) => {
    if (err) throw err;

    res.render("reset_password", {
      error: null,
      success: "Password successfully reset! You can now log in."
    });
  });
});


// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// Start server
app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});

// Fallback 
app.use((req, res) => {
  res.status(404).send("404 - Page not found");
});

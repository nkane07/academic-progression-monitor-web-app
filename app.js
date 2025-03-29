const express = require("express");
const app = express();
const mysql = require("mysql2");
const session = require("express-session");
const path = require("path");
const multer = require("multer");

// Set up Multer storage for profile images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads"); // Folder must exist
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix);
  },
});

const upload = multer({ storage: storage });


const conn = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "academic_progression",
  port: "3306",
});

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));



// Global year middleware
app.use((req, res, next) => {
  res.locals.currentYear = new Date().getFullYear();
  next();
});

app.use(
  session({
    secret: "mysecretsessionkey",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 600000 }, // 10 min session
  })
);

// Render login page
app.get("/", (req, res) => {
  res.render("login");
});

// Handle login form submission
const bcrypt = require('bcrypt'); // Add this at the top with other requires

app.post("/login", (req, res) => {
  const username = req.body.userField;
  const password = req.body.password;

  const query = "SELECT * FROM users WHERE username = ?";
  conn.query(query, [username], (err, results) => {
    if (err) throw err;

    if (results.length > 0) {
      const user = results[0];

      bcrypt.compare(password, user.password_hash, (err, isMatch) => {
        if (err) throw err;
        if (isMatch) {
          req.session.userId = user.user_id;
          req.session.userRole = user.role;

          // IF STUDENT, FETCH THEIR NAME FROM STUDENTS TABLE
          if (user.role === "student") {
            const studentQuery = "SELECT first_name, last_name FROM students WHERE user_id = ?";
            conn.query(studentQuery, [user.user_id], (err, studentResult) => {
              if (err) throw err;

              if (studentResult.length > 0) {
                req.session.studentName = `${studentResult[0].first_name} ${studentResult[0].last_name}`;
              } else {
                req.session.studentName = 'Student';
              }

              res.redirect("/student");
            });
          } else if (user.role === "admin") {
            res.redirect("/admin");
          }
        } else {
          res.send("Incorrect password. <a href='/'>Try again</a>");
        }
      });
    } else {
      res.send("User not found. <a href='/'>Try again</a>");
    }
  });
});



// Student dashboard (protected)
app.get("/student", (req, res) => {
  if (req.session.userRole === "student") {
    const studentName = req.session.studentName || 'Student';
    res.render("student_dashboard", { studentName: studentName });
  } else {
    res.redirect("/");
  }
});


// Admin dashboard (protected)
app.get("/admin", (req, res) => {
  if (req.session.userRole === "admin") {
    res.render("admin_dashboard");
  } else {
    res.redirect("/");
  }
});


app.get("/student/records", (req, res) => {
  if (req.session.userRole !== "student") return res.redirect("/");

  const userId = req.session.userId;

  const studentQuery = `SELECT student_number, pathway FROM students WHERE user_id = ?`;

  conn.query(studentQuery, [userId], (err, studentResult) => {
    if (err) throw err;
    if (studentResult.length === 0) return res.send("Student not found.");

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
      if (err) throw err;

      let totalCredits = 0, totalGrade = 0, gradedModules = 0;
      let failedModules = [], resitModules = [], coreFails = 0;
      let level1Credits = 0;
      const level1ModuleCodes = [
        'IFSY-123','IFSY-125','IFSY-126','IFSY-127','IFSY-128','IFSY-129','IFSY-130','IFSY-131','IFSY-132','IFSY-133',
        'BSAS-102','BSAS-109','BSAS-112','BSAS-113','IFSY-124','FINA-107'
      ];

      // Count credits and collect data
      const attemptTracker = {};

      records.forEach(record => {
        const grade = parseFloat(record.grade) || 0;
        const modCode = record.module_code;

        if (record.grade_result === 'pass' || record.grade_result === 'pass capped') {
          totalCredits += record.credits_earned;
          if (level1ModuleCodes.includes(modCode)) {
            level1Credits += record.credits_earned;
          }
        }

        if (record.grade_result !== 'excused' && record.grade_result !== 'absent') {
          totalGrade += grade;
          gradedModules++;
        }

        // Track failed attempts per module
        if (['fail', 'absent'].includes(record.grade_result)) {
          attemptTracker[modCode] = (attemptTracker[modCode] || 0) + 1;
          resitModules.push(record.module_name);
          failedModules.push(record.module_name);
        }

        if (['excused'].includes(record.grade_result)) {
          resitModules.push(record.module_name);
        }
      });

      // Determine estimated current year based on total credits
      let requiredCredits, currentLevel, currentLevelLabel;
      if (totalCredits >= 240) {
        requiredCredits = 360;
        currentLevel = 'L3';
        currentLevelLabel = 'Year 3';
      } else if (totalCredits >= 120) {
        requiredCredits = 240;
        currentLevel = 'L2';
        currentLevelLabel = 'Year 2';
      } else {
        requiredCredits = 120;
        currentLevel = 'L1';
        currentLevelLabel = 'Year 1';
      }

      // Core module check
      const coreModules = (pathway === 'Information Systems' && currentLevel === 'L2') ? ['IFSY-259', 'IFSY-240']
                       : (pathway === 'Business Data Analytics' && currentLevel === 'L2') ? ['IFSY-257']
                       : [];

      records.forEach(record => {
        if (coreModules.includes(record.module_code) && ['fail', 'absent'].includes(record.grade_result)) {
          coreFails++;
        }
      });

      const averageGrade = gradedModules ? (totalGrade / gradedModules).toFixed(2) : 0;

      // Determine final decision
      if (currentLevelLabel === 'Year 3') {
        decision = "Progress to Final Year";
      } else {
        const nextYearNum = parseInt(currentLevelLabel.split(" ")[1]) + 1;
        decision = `Progress to Year ${nextYearNum}`;
      }
      

      if (totalCredits < 100 || averageGrade < 40) {
        decision = "Resit Required or Contact Advisor";
      }

      if (coreFails > 0) {
        decision = "Failed Core Module - Contact Advisor";
      }

      if (currentLevel === 'L2' || currentLevel === 'L3') {
        if (level1Credits < 120) {
          decision = "Incomplete Year 1 Modules - Cannot Progress";
        }
      }

      const exceededAttempts = Object.entries(attemptTracker).filter(([_, count]) => count >= 4);
      if (exceededAttempts.length > 0) {
        decision = "Exceeded Max Attempts - Contact Advisor";
      }

      res.render("student_records", {
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
});




app.get("/student/profile", (req, res) => {
  if (req.session.userRole === "student") {
    const userId = req.session.userId;

    const studentQuery = `SELECT * FROM students WHERE user_id = ?`;
    conn.query(studentQuery, [userId], (err, studentResult) => {
      if (err) throw err;
      if (studentResult.length === 0) return res.send("Student not found.");

      const student = studentResult[0];

      // Logic to calculate current year based on credits
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

        res.render("student_profile", {
          student: {
            ...student,
            current_level: currentLevel
          },
          currentYearDisplay,
          cleared: req.query.cleared
        });
      });
    });
  } else {
    res.redirect("/");
  }
});

// Student Inbox
app.get("/student/messages", (req, res) => {
  if (req.session.userRole !== "student") return res.redirect("/");

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



// Contact advisor form
app.get("/student/messages/contact", (req, res) => {
  res.render("student_compose_message");
});

// View specific message by ID
app.get("/student/messages/:id", (req, res) => {
  const userId = req.session.userId;
  const messageId = req.params.id;

  const messageQuery = `
    SELECT m.*, u.username AS sender_name 
    FROM messages m 
    JOIN users u ON m.sender_id = u.user_id 
    WHERE m.recipient_id = ? AND m.message_id = ?
  `;

  conn.query(messageQuery, [userId, messageId], (err, result) => {
    if (err) throw err;
    if (result.length === 0) return res.send("Message not found.");

    const message = result[0];

    conn.query(`UPDATE messages SET is_read = 1 WHERE message_id = ?`, [messageId]);

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
        replies
      });
    });
  });
});

app.post("/student/messages/reply", (req, res) => {
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
      res.redirect("/student/messages/" + parent_id);
    });
  });
});

app.post("/student/messages/:id/delete", (req, res) => {
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


// Handle form
app.post("/student/messages/contact", (req, res) => {
  const userId = req.session.userId;
  const { subject, body } = req.body;

  const advisorQuery = "SELECT user_id FROM users WHERE role = 'advisor' LIMIT 1";

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
      res.redirect("/student/messages?box=sent&sent=1");


    });
  });
});




// Profile Update Route 
app.post("/student/profile/update", upload.single("profile_image"), (req, res) => {
  if (req.session.userRole === "student") {
    const userId = req.session.userId;
    const { secondary_email } = req.body;
    const profileImage = req.file ? `/uploads/${req.file.filename}` : null;

    const selectQuery = `SELECT profile_image, secondary_email FROM students WHERE user_id = ?`;
    conn.query(selectQuery, [userId], (err, results) => {
      if (err) throw err;
      const current = results[0];
      const finalImage = profileImage || current.profile_image;
      const finalEmail = secondary_email || current.secondary_email;

      const updateQuery = `UPDATE students SET profile_image = ?, secondary_email = ? WHERE user_id = ?`;
      conn.query(updateQuery, [finalImage, finalEmail, userId], (err) => {
        if (err) throw err;
        res.redirect("/student/profile");
      });
    });
  } else {
    res.redirect("/");
  }
});


// Admin dashboard (protected)
app.get("/admin", (req, res) => {
  if (req.session.userRole === "admin") {
    res.render("admin_dashboard");
  } else {
    res.redirect("/");
  }
});

app.get("/admin/messages/new", (req, res) => {
  if (req.session.userRole !== "admin") return res.redirect("/");

  const query = `
    SELECT u.user_id, s.student_number, s.first_name, s.last_name
    FROM users u
    JOIN students s ON u.user_id = s.user_id
    WHERE u.role = 'student'
  `;

  conn.query(query, (err, students) => {
    if (err) throw err;

    res.render("admin_send_message", { students });
  });
});

app.post("/admin/messages/send", (req, res) => {
  if (req.session.userRole !== "admin") return res.redirect("/");

  const senderId = req.session.userId; // The admin
  const { recipient_id, subject, body } = req.body;

  const query = `
    INSERT INTO messages (sender_id, recipient_id, subject, body, sent_at, is_read)
    VALUES (?, ?, ?, ?, NOW(), 0)
  `;

  conn.query(query, [senderId, recipient_id, subject, body], (err) => {
    if (err) throw err;
    res.redirect("/admin?sent=1");
  });
});


// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});


// Start the server
app.listen(3000, () => {
  console.log(`Server running at http://localhost:3000`);
});

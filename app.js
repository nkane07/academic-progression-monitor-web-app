const express = require("express");
const app = express();
const mysql = require("mysql2");
const session = require("express-session");

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


//  Student Academic Records Route 
app.get("/student/records", (req, res) => {
  if (req.session.userRole !== "student") return res.redirect("/");

  const userId = req.session.userId;
  const studentQuery = `SELECT student_number, pathway, current_year FROM students WHERE user_id = ?`;

  conn.query(studentQuery, [userId], (err, studentResult) => {
    if (err) throw err;
    if (studentResult.length === 0) return res.send("Student not found.");

    const { student_number, pathway, current_year } = studentResult[0];
    console.log("Student Number:", student_number);

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

      const coreModules = (pathway === 'Information Systems' && current_year === 'L2') ? ['IFSY259', 'IFSY240']
                        : (pathway === 'Business Data Analytics' && current_year === 'L2') ? ['IFSY257']
                        : [];

      records.forEach(record => {
        const grade = parseFloat(record.grade) || 0;

        if (record.grade_result === 'pass' || record.grade_result === 'pass capped') {
          totalCredits += record.credits_earned;
        }

        // For average grade calc (excluding excused/absent)
        if (record.grade_result !== 'excused' && record.grade_result !== 'absent') {
          totalGrade += grade;
          gradedModules++;
        }

        // Check core module fails
        if (coreModules.includes(record.module_code) && (record.grade_result === 'fail' || record.grade_result === 'absent')) {
          coreFails++;
        }

        // Resit logic
        if (['fail', 'absent', 'excused'].includes(record.grade_result)) {
          resitModules.push(record.module_name);
          failedModules.push(record.module_name);
        }
      });

      const averageGrade = gradedModules ? (totalGrade / gradedModules).toFixed(2) : 0;
      let decision = "Progress to Year 2";

      // Apply rules
      if (totalCredits < 100 || averageGrade < 40 || coreFails > 0) {
        decision = "Resit Required or Contact Advisor";
      }
      if (coreFails > 0) decision = "Failed Core Module - Contact Advisor";
      

      let requiredCredits;
if (current_year === 'L3') {
    requiredCredits = 360;
} else if (current_year === 'L2') {
    requiredCredits = 240;
} else {
    requiredCredits = 120;
}
      console.log("Enrollment Records:", records);
      res.render("student_records", {
        records,
        totalCredits,
        requiredCredits,
        averageGrade,
        failedModules,
        resitModules,
        decision
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

      res.render("student_profile", {
        student: studentResult[0],
        cleared: req.query.cleared 
      });
    });
  } else {
    res.redirect("/");
  }
});


// Profile Update Route 
app.post("/student/profile/update", (req, res) => {
  if (req.session.userRole === "student") {
    const userId = req.session.userId;
    const { profile_image, secondary_email } = req.body;

    // Get current student data first
    const getStudentQuery = `SELECT profile_image, secondary_email FROM students WHERE user_id = ?`;
    conn.query(getStudentQuery, [userId], (err, results) => {
      if (err) throw err;

      const current = results[0];
      // Use new input if provided, else keep existing
      const updatedProfileImage = profile_image.trim() !== "" ? profile_image : current.profile_image;
      const updatedSecondaryEmail = secondary_email.trim() !== "" ? secondary_email : current.secondary_email;

      const updateQuery = `
        UPDATE students 
        SET profile_image = ?, secondary_email = ?
        WHERE user_id = ?
      `;
      conn.query(updateQuery, [updatedProfileImage, updatedSecondaryEmail, userId], (err) => {
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

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});


// Start the server
app.listen(3000, () => {
  console.log(`Server running at http://localhost:3000`);
});

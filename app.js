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


//  Student Academic Records Route - PLACE THIS RIGHT HERE
app.get("/student/records", (req, res) => {
  if (req.session.userRole !== "student") {
    return res.redirect("/");
  }

  const userId = req.session.userId;

  // Find the student's internal ID from the students table using userId
  const studentQuery = `SELECT student_number FROM students WHERE user_id = ?`;

conn.query(studentQuery, [userId], (err, studentResult) => {
  if (err) throw err;
  if (studentResult.length === 0) return res.send("Student not found.");

  const studentNumber = studentResult[0].student_number;
  console.log("Student Number:", studentNumber);  // Should print 22-IFSY-0933003

  const recordsQuery = `
  SELECT 
    e.academic_year,
    m.module_name,
    e.grade,
    e.grade_result,
    e.resit_grade,
    e.resit_result,
    e.credits_earned
  FROM enrollment e
  JOIN modules m ON e.module_code = m.module_code
  WHERE e.student_id = ?
`;


  conn.query(recordsQuery, [studentNumber], (err, results) => {
    if (err) throw err;
    console.log("Enrollment Records:", results);
    res.render("student_records", { records: results });
  });
});
});

app.get("/student/profile", (req, res) => {
  if (req.session.userRole === "student") {
    const userId = req.session.userId;
    const query = "SELECT * FROM students WHERE user_id = ?";
    conn.query(query, [userId], (err, results) => {
      if (err) throw err;
      if (results.length === 0) return res.send("Student not found");
      res.render("student_profile", { student: results[0] });
    });
  } else {
    res.redirect("/");
  }
});

// ✅ Profile Update Route (POST)
app.post("/student/profile/update", (req, res) => {
  if (req.session.userRole === "student") {
    const userId = req.session.userId;
    const { profile_image, secondary_email } = req.body;
    const updateQuery = `
      UPDATE students 
      SET profile_image = ?, secondary_email = ?
      WHERE user_id = ?
    `;
    conn.query(updateQuery, [profile_image, secondary_email, userId], (err) => {
      if (err) throw err;
      res.redirect("/student/profile");
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

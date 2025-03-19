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
app.post("/login", (req, res) => {
  const userField = req.body.userField;
  const password = req.body.password;

  const query = "SELECT * FROM users WHERE username = ?";

  conn.query(query, [userField], (err, results) => {
    if (err) throw err;

    if (results.length > 0) {
      const user = results[0];
      // For simplicity, we're not hashing passwords here (DO hash in production)
      if (password === user.password_hash) {
        req.session.userId = user.user_id;
        req.session.userRole = user.role;

        // Redirect based on role
        if (user.role === "admin") {
          res.redirect("/admin");
        } else if (user.role === "student") {
          res.redirect("/student");
        } else {
          res.send("Unauthorized role");
        }
      } else {
        res.send("Incorrect password. <a href='/'>Try again</a>");
      }
    } else {
      res.send("User not found. <a href='/'>Try again</a>");
    }
  });
});

// Student dashboard (protected)
app.get("/student", (req, res) => {
  if (req.session.userRole === "student") {
    res.render("student_dashboard");
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

const mysql = require('mysql2');
const bcrypt = require('bcrypt');

//connection pool
const conn = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "academic_progression",
  port: "3306",
});

//salt rounds
const saltRounds = 10;

//admin details
const newAdminUsername = 'admin1';
const newAdminPassword = 'adminpass123';

//database query - add new admin
conn.query("SELECT * FROM users WHERE username = ?", [newAdminUsername], (err, results) => {
  if (err) throw err;

  // check if username already exists
  if (results.length > 0) {
    console.log(`Admin '${newAdminUsername}' already exists.`);
    process.exit();
  } else {
    bcrypt.hash(newAdminPassword, saltRounds, (err, hash) => {
      if (err) throw err;

      //insert query
      const query = "INSERT INTO users (username, password_hash, role, created_at, updated_at) VALUES (?, ?, 'admin', NOW(), NOW())";
      conn.query(query, [newAdminUsername, hash], (err, result) => {
        if (err) throw err;
        console.log(`Admin '${newAdminUsername}' added successfully!`);
        process.exit();
      });
    });
  }
});

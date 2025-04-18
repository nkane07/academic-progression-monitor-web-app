const mysql = require('mysql2');
const bcrypt = require('bcrypt');

// connection to database
const conn = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "academic_progression",
  port: "3306",
});

//salt rounds for bcrypt hashing
const saltRounds = 10;

//admin details
const newAdminUsername = 'admin1';
const newAdminPassword = 'adminpass123';

//hash password
bcrypt.hash(newAdminPassword, saltRounds, (err, hash) => {
  if (err) throw err;

  //query for users table
  const query = "INSERT INTO users (username, password_hash, role, created_at, updated_at) VALUES (?, ?, 'admin', NOW(), NOW())";
  conn.query(query, [newAdminUsername, hash], (err, result) => {
    if (err) throw err;
    console.log(`Admin '${newAdminUsername}' added successfully!`);
    process.exit();
  });
});

const mysql = require('mysql2');
const bcrypt = require('bcrypt');

const conn = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "academic_progression",
  port: "3306",
});

const saltRounds = 10;
const newAdminUsername = 'admin2';
const newAdminPassword = 'adminpass123';

bcrypt.hash(newAdminPassword, saltRounds, (err, hash) => {
  if (err) throw err;

  const query = "INSERT INTO users (username, password_hash, role, created_at, updated_at) VALUES (?, ?, 'admin', NOW(), NOW())";
  conn.query(query, [newAdminUsername, hash], (err, result) => {
    if (err) throw err;
    console.log(`✅ Admin '${newAdminUsername}' added successfully!`);
    process.exit();
  });
});

const mysql = require('mysql2');
const bcrypt = require('bcrypt');

const conn = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "academic_progression",
  port: "3306",
});

const defaultPassword = 'studentpass';
const saltRounds = 10;

bcrypt.hash(defaultPassword, saltRounds, (err, hash) => {
  if (err) throw err;

  const query = "UPDATE users SET password_hash = ? WHERE role = 'student'";
  conn.query(query, [hash], (err, result) => {
    if (err) throw err;
    console.log(`Rehashed ${result.affectedRows} student passwords with bcrypt`);
    process.exit();
  });
});

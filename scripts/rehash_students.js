const mysql = require('mysql2');
const bcrypt = require('bcrypt');

//connection pool
const conn = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "40176951",
  port: "3306",
});

// default student password
const defaultPassword = 'studentpass';

//salt rounds
const saltRounds = 10;

//hash the default password
bcrypt.hash(defaultPassword, saltRounds, (err, hash) => {
  if (err) throw err;

  //update password and hash
  const query = "UPDATE users SET password_hash = ? WHERE role = 'student'";
  conn.query(query, [hash], (err, result) => {
    if (err) throw err;
    console.log(`Rehashed ${result.affectedRows} student passwords with bcrypt`);
    process.exit();
  });
});

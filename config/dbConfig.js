const mysql = require('mysql2');

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',       
  password: '',       
  database: 'academic_progression',
  port: 3306
});

db.getConnection((err)=> {
  if (err) return console.log(err.message);
  console.log("connected successfully");
});


module.exports = db;

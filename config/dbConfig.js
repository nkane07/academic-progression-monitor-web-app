const mysql = require('mysql2');

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',       
  password: '',       
  database: '40176951',
  port: 3306
});

db.getConnection((err)=> {
  if (err) return console.log(err.message);
  console.log("connected successfully");
});


module.exports = db;

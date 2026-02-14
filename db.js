// server/db.js
const mysql = require('mysql2');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',      // Username ของ MySQL (XAMPP ปกติคือ root)
    password: '',      // Password ของ MySQL (XAMPP ปกติคือว่างไว้)
    database: 'test1_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// แปลงให้ใช้ Async/Await ได้ เพื่อความง่าย
const promisePool = pool.promise();

console.log('Connected to MySQL Database!');

module.exports = promisePool;
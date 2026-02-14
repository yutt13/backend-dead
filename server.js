// server/server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./db"); // เรียกใช้ไฟล์ db.js ที่เราเพิ่งสร้าง

const app = express();
const PORT = 3000;

// Middleware
app.use(cors()); // อนุญาตให้ Frontend (คนละ Port) เรียกใช้ได้
app.use(bodyParser.json());

// --- Routes (เส้นทาง API) ---

// 1. API ดึงรายการหนังสือทั้งหมด
// GET http://localhost:3000/api/books
app.get("/api/books", async (req, res) => {
  try {
    // query ข้อมูลจากตาราง books
    const [rows] = await db.query("SELECT * FROM books");
    res.json(rows); // ส่งข้อมูลกลับไปเป็น JSON
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
  }
});

// 2. API สำหรับ Login (แบบง่าย)
// POST http://localhost:3000/api/login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    // ค้นหา User ที่มี username และ password ตรงกัน
    const [users] = await db.query(
      "SELECT * FROM members WHERE username = ? AND password = ?",
      [username, password],
    );

    if (users.length > 0) {
      // เจอ User -> Login สำเร็จ
      const user = users[0];
      res.json({
        success: true,
        user: { id: user.member_id, name: user.full_name, role: user.role },
      });
    } else {
      // ไม่เจอ -> Login ไม่สำเร็จ
      res
        .status(401)
        .json({ success: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login Error" });
  }
});
// 3. API ยืมหนังสือ
// POST http://localhost:3000/api/borrow
app.post("/api/borrow", async (req, res) => {
  const { member_id, book_id } = req.body;
  try {
    // เริ่ม Transaction (เพื่อให้ทำงานพร้อมกันทั้ง 2 ตาราง)
    await db.query("START TRANSACTION");

    // 3.1 บันทึกลงตาราง borrowing
    await db.query("INSERT INTO borrowing (member_id, book_id) VALUES (?, ?)", [
      member_id,
      book_id,
    ]);

    // 3.2 อัปเดตสถานะหนังสือในตาราง books เป็น 'borrowed'
    await db.query('UPDATE books SET status = "borrowed" WHERE book_id = ?', [
      book_id,
    ]);

    // ยืนยัน Transaction
    await db.query("COMMIT");

    res.json({ success: true, message: "ยืมหนังสือสำเร็จ" });
  } catch (err) {
    await db.query("ROLLBACK"); // ถ้าพังให้ยกเลิกทั้งหมด
    console.error(err);
    res.status(500).json({ error: "การยืมล้มเหลว" });
  }
});

// 4. API คืนหนังสือ
// POST http://localhost:3000/api/return
app.post("/api/return", async (req, res) => {
  const { member_id, book_id } = req.body;
  try {
    await db.query("START TRANSACTION");

    // 4.1 อัปเดตวันคืนในตาราง borrowing (เฉพาะรายการที่ยังไม่คืน)
    await db.query(
      "UPDATE borrowing SET return_date = NOW() WHERE member_id = ? AND book_id = ? AND return_date IS NULL",
      [member_id, book_id],
    );

    // 4.2 อัปเดตสถานะหนังสือกลับเป็น 'available'
    await db.query('UPDATE books SET status = "available" WHERE book_id = ?', [
      book_id,
    ]);

    await db.query("COMMIT");

    res.json({ success: true, message: "คืนหนังสือสำเร็จ" });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "การคืนล้มเหลว" });
  }
});

// 5. API ดึงรายการที่กำลังยืมอยู่ (Active Borrows) ของสมาชิกคนนั้น
// GET http://localhost:3000/api/borrowed/1
app.get("/api/borrowed/:member_id", async (req, res) => {
  const { member_id } = req.params;
  try {
    const [rows] = await db.query(
      `
            SELECT b.book_id, b.title, b.author, b.cover_url, br.borrow_date 
            FROM borrowing br
            JOIN books b ON br.book_id = b.book_id
            WHERE br.member_id = ? AND br.return_date IS NULL
        `,
      [member_id],
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ดึงข้อมูลไม่สำเร็จ" });
  }
});

// 6. API ดึงประวัติการยืมทั้งหมด (History)
app.get("/api/history/:member_id", async (req, res) => {
  const { member_id } = req.params;
  try {
    const [rows] = await db.query(
      `
            SELECT b.title, br.borrow_date, br.return_date 
            FROM borrowing br
            JOIN books b ON br.book_id = b.book_id
            WHERE br.member_id = ?
            ORDER BY br.borrow_date DESC
        `,
      [member_id],
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ดึงประวัติไม่สำเร็จ" });
  }
});
// 7. API สมัครสมาชิก (Register)
// POST http://localhost:3000/api/register
app.post('/api/register', async (req, res) => {
    const { username, password, fullName } = req.body;
    
    // ตรวจสอบว่าส่งข้อมูลมาครบไหม
    if (!username || !password || !fullName) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบ' });
    }

    try {
        // ตรวจสอบว่ามี Username นี้ซ้ำไหม
        const [existingUsers] = await db.query('SELECT * FROM members WHERE username = ?', [username]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });
        }

        // เพิ่มสมาชิกใหม่ลง Database
        await db.query(
            'INSERT INTO members (username, password, full_name, role) VALUES (?, ?, ?, ?)',
            [username, password, fullName, 'user'] // กำหนด role เป็น 'user' อัตโนมัติ
        );

        res.json({ success: true, message: 'สมัครสมาชิกสำเร็จ' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการสมัครสมาชิก' });
    }
});
// 8. API ดึงรายชื่อสมาชิกทั้งหมด (Member List Screen)
// GET /api/members
app.get('/api/members', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT member_id, username, full_name, role, created_at FROM members ORDER BY member_id DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'ดึงข้อมูลสมาชิกไม่สำเร็จ' });
    }
});

// 9. API เพิ่มหนังสือใหม่ (Add Book Screen)
// POST /api/books
app.post('/api/books', async (req, res) => {
    const { title, author, cover_url } = req.body;
    try {
        await db.query(
            'INSERT INTO books (title, author, cover_url, status) VALUES (?, ?, ?, "available")',
            [title, author, cover_url]
        );
        res.json({ success: true, message: 'เพิ่มหนังสือสำเร็จ' });
    } catch (err) {
        res.status(500).json({ error: 'เพิ่มหนังสือไม่สำเร็จ' });
    }
});

// 10. API ดูรายการที่กำลังถูกยืมอยู่ทั้งหมด (Borrowed List Screen)
// GET /api/borrowed-all
app.get('/api/borrowed-all', async (req, res) => {
    try {
        // join 3 ตาราง: borrowing, books, members เพื่อให้รู้ว่า ใครยืมเล่มไหน
        const [rows] = await db.query(`
            SELECT br.borrow_id, b.title, b.cover_url, m.full_name, br.borrow_date
            FROM borrowing br
            JOIN books b ON br.book_id = b.book_id
            JOIN members m ON br.member_id = m.member_id
            WHERE br.return_date IS NULL
            ORDER BY br.borrow_date DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'ดึงข้อมูลไม่สำเร็จ' });
    }
});
// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

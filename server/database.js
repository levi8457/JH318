const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 确保数据目录存在
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 数据库文件路径
const dbPath = path.join(dataDir, 'hospital.db');

// 初始化数据库连接
const db = new Database(dbPath);

// 启用 WAL 模式提升性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 创建所有表
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'nurse', 'doctor')),
    room_id INTEGER,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    avatar_path TEXT,
    title TEXT,
    specialty TEXT,
    bio TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  );

  CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    age INTEGER,
    symptom_name TEXT,
    is_reserved INTEGER DEFAULT 0,
    source TEXT DEFAULT '现场挂号',
    visit_history TEXT,
    symptoms TEXT,
    remarks TEXT,
    doctor_id INTEGER,
    ticket_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting', 'calling', 'skipped', 'done')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (doctor_id) REFERENCES accounts(id)
  );

  CREATE TABLE IF NOT EXISTS call_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    doctor_id INTEGER NOT NULL,
    call_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    start_time TEXT,
    end_time TEXT,
    status TEXT NOT NULL DEFAULT 'calling' CHECK(status IN ('calling', 'completed', 'skipped')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (doctor_id) REFERENCES accounts(id)
  );

  CREATE TABLE IF NOT EXISTS operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id INTEGER,
    operator_name TEXT,
    operation_type TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    score_date TEXT NOT NULL,
    volume_score REAL DEFAULT 0,
    attendance_score REAL DEFAULT 0,
    subjective_score REAL DEFAULT 0,
    total_score REAL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    display_code TEXT,
    current_doctor_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (current_doctor_id) REFERENCES accounts(id)
  );

  CREATE TABLE IF NOT EXISTS work_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    login_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    logout_time TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  );

  CREATE TABLE IF NOT EXISTS motivational_quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    author TEXT,
    category TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

// ==================== 辅助函数 ====================

/**
 * 患者姓名脱敏
 * 3字及以上: 姓 + * + 最后一个字 (例: 张三丰 -> 张*丰)
 * 2字: 姓 + * (例: 张三 -> 张*)
 */
function maskName(name) {
  if (!name) return '';
  if (name.length >= 3) {
    return name.charAt(0) + '*' + name.charAt(name.length - 1);
  }
  return name.charAt(0) + '*';
}

/**
 * 生成今日患者编号
 * 格式: A + 3位数字补零 (如 A001, A002)
 * 每日从1开始
 */
function generateTicketNumber() {
  const today = getTodayStr();
  const prefix = 'A';

  const row = db.prepare(`
    SELECT ticket_number FROM patients
    WHERE ticket_number LIKE ? AND created_at LIKE ?
    ORDER BY ticket_number DESC LIMIT 1
  `).get(`${prefix}%`, `${today}%`);

  let nextNum = 1;
  if (row) {
    const currentNum = parseInt(row.ticket_number.substring(1), 10);
    nextNum = currentNum + 1;
  }

  return prefix + String(nextNum).padStart(3, '0');
}

/**
 * 获取今日日期字符串 (YYYY-MM-DD)
 */
function getTodayStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 记录操作日志
 */
function logOperation(operatorId, operatorName, operationType, targetType, targetId, detail) {
  db.prepare(`
    INSERT INTO operation_logs (operator_id, operator_name, operation_type, target_type, target_id, detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    operatorId || null,
    operatorName || '',
    operationType,
    targetType || '',
    targetId || null,
    detail ? JSON.stringify(detail) : null
  );
}

/**
 * 标准成功响应
 */
function success(res, data, message) {
  return res.json({
    code: 0,
    message: message || 'success',
    data: data || null
  });
}

/**
 * 标准失败响应
 */
function fail(res, message, code) {
  return res.json({
    code: code || 1,
    message: message || 'error',
    data: null
  });
}

module.exports = {
  db,
  maskName,
  generateTicketNumber,
  getTodayStr,
  logOperation,
  success,
  fail
};

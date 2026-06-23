/**
 * 导诊护士路由（需要 nurse 角色）
 * - POST   /api/nurse/patients     录入患者信息
 * - GET    /api/nurse/patients     获取今日患者列表
 * - PUT    /api/nurse/patients/:id 修改患者信息
 * - GET    /api/nurse/doctors      获取当前在岗医生列表
 */
const express = require('express');
const router = express.Router();
const { db, success, fail, logOperation, getTodayStr, generateTicketNumber, maskName } = require('../database');
const { verifyToken, roleCheck } = require('../middleware');

// 所有路由需要认证 + 护士角色
router.use(verifyToken, roleCheck(['nurse', 'admin']));

/**
 * POST /api/nurse/patients
 * 录入患者信息并自动分配全院统一编号（格式 A001，每日从1开始）
 */
router.post('/patients', (req, res) => {
  try {
    const {
      name, age, symptom_name, is_reserved, source,
      visit_history, symptoms, remarks, doctor_id
    } = req.body;

    if (!name) {
      return fail(res, '请输入患者姓名');
    }

    if (!doctor_id) {
      return fail(res, '请选择就诊医生');
    }

    // 验证医生是否存在且在岗
    const doctor = db.prepare(`
      SELECT id, name, status FROM accounts WHERE id = ? AND role = 'doctor' AND status = 'active'
    `).get(doctor_id);

    if (!doctor) {
      return fail(res, '所选医生不存在或未在岗');
    }

    // 生成今日编号
    const ticketNumber = generateTicketNumber();

    // 插入患者记录
    const result = db.prepare(`
      INSERT INTO patients (name, age, symptom_name, is_reserved, source, visit_history, symptoms, remarks, doctor_id, ticket_number, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting')
    `).run(
      name,
      age || null,
      symptom_name || '',
      is_reserved ? 1 : 0,
      source || '现场挂号',
      visit_history || '',
      symptoms || '',
      remarks || '',
      doctor_id,
      ticketNumber
    );

    // 记录操作日志
    logOperation(
      req.user.id, req.user.name,
      'create_patient', 'patient', result.lastInsertRowid,
      { name: maskName(name), ticket_number: ticketNumber, doctor_name: doctor.name }
    );

    return success(res, {
      id: result.lastInsertRowid,
      ticket_number: ticketNumber
    }, `患者 ${maskName(name)} 已录入，编号 ${ticketNumber}`);
  } catch (err) {
    console.error('录入患者失败:', err);
    return fail(res, '录入患者失败，服务器错误');
  }
});

/**
 * GET /api/nurse/patients
 * 获取今日患者列表（姓名脱敏），支持 doctor_id 筛选
 */
router.get('/patients', (req, res) => {
  try {
    const { doctor_id, status } = req.query;
    const today = getTodayStr();

    let patients;
    if (doctor_id) {
      patients = db.prepare(`
        SELECT p.id, p.name, p.age, p.symptom_name, p.is_reserved, p.source,
               p.doctor_id, p.ticket_number, p.status, p.created_at,
               a.name AS doctor_name
        FROM patients p
        LEFT JOIN accounts a ON p.doctor_id = a.id
        WHERE p.created_at LIKE ? AND p.doctor_id = ?
        ${status ? 'AND p.status = ?' : ''}
        ORDER BY p.ticket_number ASC
      `).all(`${today}%`, doctor_id, ...(status ? [status] : []));
    } else {
      patients = db.prepare(`
        SELECT p.id, p.name, p.age, p.symptom_name, p.is_reserved, p.source,
               p.doctor_id, p.ticket_number, p.status, p.created_at,
               a.name AS doctor_name
        FROM patients p
        LEFT JOIN accounts a ON p.doctor_id = a.id
        WHERE p.created_at LIKE ?
        ${status ? 'AND p.status = ?' : ''}
        ORDER BY p.ticket_number ASC
      `).all(`${today}%`, ...(status ? [status] : []));
    }

    // 对姓名进行脱敏
    const maskedPatients = patients.map(p => ({
      ...p,
      name: maskName(p.name)
    }));

    return success(res, maskedPatients);
  } catch (err) {
    console.error('获取患者列表失败:', err);
    return fail(res, '获取患者列表失败，服务器错误');
  }
});

/**
 * PUT /api/nurse/patients/:id
 * 修改患者信息（记录操作日志）
 */
router.put('/patients/:id', (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, age, symptom_name, is_reserved, source,
      visit_history, symptoms, remarks, doctor_id
    } = req.body;

    // 查询患者是否存在
    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
    if (!patient) {
      return fail(res, '患者不存在');
    }

    // 构建更新字段
    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (age !== undefined) { updates.push('age = ?'); values.push(age); }
    if (symptom_name !== undefined) { updates.push('symptom_name = ?'); values.push(symptom_name); }
    if (is_reserved !== undefined) { updates.push('is_reserved = ?'); values.push(is_reserved ? 1 : 0); }
    if (source !== undefined) { updates.push('source = ?'); values.push(source); }
    if (visit_history !== undefined) { updates.push('visit_history = ?'); values.push(visit_history); }
    if (symptoms !== undefined) { updates.push('symptoms = ?'); values.push(symptoms); }
    if (remarks !== undefined) { updates.push('remarks = ?'); values.push(remarks); }
    if (doctor_id !== undefined) { updates.push('doctor_id = ?'); values.push(doctor_id); }

    if (updates.length === 0) {
      return fail(res, '没有需要修改的字段');
    }

    updates.push("updated_at = datetime('now', 'localtime')");
    values.push(id);

    db.prepare(`UPDATE patients SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // 记录操作日志
    const changes = {};
    if (name !== undefined) changes.name = { old: maskName(patient.name), new: maskName(name) };
    if (doctor_id !== undefined) {
      const oldDoctor = db.prepare('SELECT name FROM accounts WHERE id = ?').get(patient.doctor_id);
      const newDoctor = db.prepare('SELECT name FROM accounts WHERE id = ?').get(doctor_id);
      changes.doctor = { old: oldDoctor?.name, new: newDoctor?.name };
    }

    logOperation(
      req.user.id, req.user.name,
      'update_patient', 'patient', parseInt(id),
      { ticket_number: patient.ticket_number, changes }
    );

    return success(res, null, '患者信息已更新');
  } catch (err) {
    console.error('修改患者信息失败:', err);
    return fail(res, '修改患者信息失败，服务器错误');
  }
});

/**
 * GET /api/nurse/doctors
 * 获取当前在岗医生列表
 */
router.get('/doctors', (req, res) => {
  try {
    const today = getTodayStr();

    // 查询今日有工作会话且状态为 active 的医生
    const doctors = db.prepare(`
      SELECT a.id, a.name, a.phone, a.title, a.specialty, a.room_id,
             r.name AS room_name, r.display_code,
             COUNT(p.id) AS today_patient_count
      FROM accounts a
      LEFT JOIN rooms r ON a.room_id = r.id
      LEFT JOIN work_sessions ws ON ws.account_id = a.id AND ws.status = 'active' AND ws.login_time LIKE ?
      LEFT JOIN patients p ON p.doctor_id = a.id AND p.created_at LIKE ?
      WHERE a.role = 'doctor' AND a.status = 'active'
      GROUP BY a.id
      ORDER BY a.name ASC
    `).all(`${today}%`, `${today}%`);

    return success(res, doctors);
  } catch (err) {
    console.error('获取医生列表失败:', err);
    return fail(res, '获取医生列表失败，服务器错误');
  }
});

module.exports = router;

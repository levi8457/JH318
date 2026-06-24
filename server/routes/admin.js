/**
 * 管理员路由（需要 admin 角色）
 * - GET  /api/admin/dashboard           仪表盘数据
 * - GET  /api/admin/accounts            获取所有账号列表
 * - POST /api/admin/accounts            创建账号
 * - PUT  /api/admin/accounts/:id        编辑账号
 * - DELETE /api/admin/accounts/:id      停用账号（软删除）
 * - GET  /api/admin/logs                获取操作记录
 * - GET  /api/admin/rooms               获取诊室列表
 * - POST /api/admin/rooms               创建诊室
 * - PUT  /api/admin/rooms/:id           编辑诊室
 * - POST /api/admin/scores/:account_id  管理员给某账号打主观评价分
 * - PUT  /api/admin/doctors/:id/profile 更新医生简历信息
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { db, success, fail, logOperation, getTodayStr } = require('../database');
const { verifyToken, roleCheck } = require('../middleware');

// 所有路由需要认证 + 管理员角色
router.use(verifyToken, roleCheck(['admin']));

/**
 * GET /api/admin/dashboard
 * 仪表盘数据（医生业绩、护士工作量、上班记录）
 */
router.get('/dashboard', (req, res) => {
  try {
    const today = getTodayStr();

    // 今日患者总数
    const todayPatientCount = db.prepare(`
      SELECT COUNT(*) AS count FROM patients WHERE created_at LIKE ?
    `).get(`${today}%`).count;

    // 今日各状态患者数
    const patientStats = db.prepare(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'waiting') AS waiting,
        COUNT(*) FILTER (WHERE status = 'calling') AS calling,
        COUNT(*) FILTER (WHERE status = 'done') AS done,
        COUNT(*) FILTER (WHERE status = 'skipped') AS skipped
      FROM patients WHERE created_at LIKE ?
    `).get(`${today}%`);

    // 医生业绩列表
    const doctorPerformance = db.prepare(`
      SELECT
        a.id, a.name, a.title, a.specialty, a.room_id,
        r.name AS room_name,
        COUNT(p.id) FILTER (WHERE p.status = 'done') AS done_count,
        COUNT(p.id) FILTER (WHERE p.status = 'waiting') AS waiting_count,
        COUNT(p.id) FILTER (WHERE p.status = 'calling') AS calling_count,
        COUNT(p.id) FILTER (WHERE p.status = 'skipped') AS skipped_count,
        ws.login_time, ws.logout_time, ws.status AS session_status
      FROM accounts a
      LEFT JOIN rooms r ON a.room_id = r.id
      LEFT JOIN patients p ON p.doctor_id = a.id AND p.created_at LIKE ?
      LEFT JOIN work_sessions ws ON ws.account_id = a.id AND ws.login_time LIKE ?
      WHERE a.role = 'doctor' AND a.status = 'active'
      GROUP BY a.id
      ORDER BY a.name ASC
    `).all(`${today}%`, `${today}%`);

    // 护士工作量（今日录入患者数）
    const nurseWorkload = db.prepare(`
      SELECT
        a.id, a.name,
        COUNT(ol.id) AS operation_count
      FROM accounts a
      LEFT JOIN operation_logs ol ON ol.operator_id = a.id AND ol.created_at LIKE ?
      WHERE a.role = 'nurse' AND a.status = 'active'
      GROUP BY a.id
      ORDER BY a.name ASC
    `).all(`${today}%`);

    // 今日上班记录
    const workSessions = db.prepare(`
      SELECT ws.id, ws.account_id, a.name, a.role, a.phone,
             ws.login_time, ws.logout_time, ws.status
      FROM work_sessions ws
      LEFT JOIN accounts a ON ws.account_id = a.id
      WHERE ws.login_time LIKE ?
      ORDER BY ws.login_time DESC
    `).all(`${today}%`);

    return success(res, {
      today_patient_count: todayPatientCount,
      patient_stats: patientStats,
      doctor_performance: doctorPerformance,
      nurse_workload: nurseWorkload,
      work_sessions: workSessions
    });
  } catch (err) {
    console.error('获取仪表盘数据失败:', err);
    return fail(res, '获取仪表盘数据失败，服务器错误');
  }
});

/**
 * GET /api/admin/accounts
 * 获取所有账号列表
 */
router.get('/accounts', (req, res) => {
  try {
    const { role, status } = req.query;

    let query = `
      SELECT a.id, a.name, a.phone, a.role, a.room_id, a.status,
             a.avatar_path, a.title, a.specialty, a.bio,
             a.created_at, a.updated_at,
             r.name AS room_name
      FROM accounts a
      LEFT JOIN rooms r ON a.room_id = r.id
      WHERE 1=1
    `;
    const params = [];

    if (role) {
      query += ' AND a.role = ?';
      params.push(role);
    }
    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }

    query += ' ORDER BY a.created_at DESC';

    const accounts = db.prepare(query).all(...params);

    return success(res, accounts);
  } catch (err) {
    console.error('获取账号列表失败:', err);
    return fail(res, '获取账号列表失败，服务器错误');
  }
});

/**
 * POST /api/admin/accounts
 * 创建账号
 */
router.post('/accounts', (req, res) => {
  try {
    const { name, phone, password, role, room_id, title, specialty, bio } = req.body;

    if (!name || !phone || !password || !role) {
      return fail(res, '请填写完整的账号信息（姓名、手机号、密码、角色）');
    }

    if (!['admin', 'nurse', 'doctor'].includes(role)) {
      return fail(res, '角色必须是 admin、nurse 或 doctor');
    }

    // 检查手机号是否已存在
    const existing = db.prepare('SELECT id FROM accounts WHERE phone = ?').get(phone);
    if (existing) {
      return fail(res, '该手机号已被注册');
    }

    // 哈希密码
    const hashedPassword = bcrypt.hashSync(password, 10);

    const result = db.prepare(`
      INSERT INTO accounts (name, phone, password, role, room_id, title, specialty, bio, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(name, phone, hashedPassword, role, room_id || null, title || '', specialty || '', bio || '');

    // 记录操作日志
    logOperation(
      req.user.id, req.user.name,
      'create_account', 'account', result.lastInsertRowid,
      { name, phone, role }
    );

    return success(res, { id: result.lastInsertRowid }, '账号创建成功');
  } catch (err) {
    console.error('创建账号失败:', err);
    return fail(res, '创建账号失败，服务器错误');
  }
});

/**
 * PUT /api/admin/accounts/:id
 * 编辑账号
 */
router.put('/accounts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, role, room_id, status, title, specialty, bio } = req.body;

    // 查询账号是否存在
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    if (!account) {
      return fail(res, '账号不存在');
    }

    // 构建更新字段
    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (phone !== undefined) {
      // 检查手机号是否被其他人使用
      const dup = db.prepare('SELECT id FROM accounts WHERE phone = ? AND id != ?').get(phone, id);
      if (dup) {
        return fail(res, '该手机号已被其他账号使用');
      }
      updates.push('phone = ?'); values.push(phone);
    }
    if (role !== undefined) { updates.push('role = ?'); values.push(role); }
    if (room_id !== undefined) { updates.push('room_id = ?'); values.push(room_id || null); }
    if (status !== undefined) { updates.push('status = ?'); values.push(status); }
    if (title !== undefined) { updates.push('title = ?'); values.push(title); }
    if (specialty !== undefined) { updates.push('specialty = ?'); values.push(specialty); }
    if (bio !== undefined) { updates.push('bio = ?'); values.push(bio); }

    if (updates.length === 0) {
      return fail(res, '没有需要修改的字段');
    }

    updates.push("updated_at = datetime('now', 'localtime')");
    values.push(id);

    db.prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // 记录操作日志
    logOperation(
      req.user.id, req.user.name,
      'update_account', 'account', parseInt(id),
      { changes: req.body }
    );

    return success(res, null, '账号信息已更新');
  } catch (err) {
    console.error('编辑账号失败:', err);
    return fail(res, '编辑账号失败，服务器错误');
  }
});

/**
 * DELETE /api/admin/accounts/:id
 * 停用账号（软删除）
 */
router.delete('/accounts/:id', (req, res) => {
  try {
    const { id } = req.params;

    // 不能停用自己
    if (parseInt(id) === req.user.id) {
      return fail(res, '不能停用自己的账号');
    }

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    if (!account) {
      return fail(res, '账号不存在');
    }

    if (account.status === 'inactive') {
      return fail(res, '账号已处于停用状态');
    }

    db.prepare(`
      UPDATE accounts SET status = 'inactive', updated_at = datetime('now', 'localtime') WHERE id = ?
    `).run(id);

    // 记录操作日志
    logOperation(
      req.user.id, req.user.name,
      'deactivate_account', 'account', parseInt(id),
      { name: account.name, phone: account.phone, role: account.role }
    );

    return success(res, null, `已停用账号 ${account.name}`);
  } catch (err) {
    console.error('停用账号失败:', err);
    return fail(res, '停用账号失败，服务器错误');
  }
});

/**
 * PUT /api/admin/accounts/:id/reset-password
 * 重置账号密码为默认密码 123456
 */
router.put('/accounts/:id/reset-password', (req, res) => {
  try {
    const { id } = req.params;

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    if (!account) {
      return fail(res, '账号不存在');
    }

    // 生成默认密码哈希
    const defaultPassword = '123456';
    const hashedPassword = bcrypt.hashSync(defaultPassword, 10);

    db.prepare(`
      UPDATE accounts SET password = ?, updated_at = datetime('now', 'localtime') WHERE id = ?
    `).run(hashedPassword, id);

    // 记录操作日志
    logOperation(
      req.user.id, req.user.name,
      'reset_password', 'account', parseInt(id),
      { name: account.name, phone: account.phone }
    );

    return success(res, null, `密码已重置为 ${defaultPassword}`);
  } catch (err) {
    console.error('重置密码失败:', err);
    return fail(res, '重置密码失败，服务器错误');
  }
});

/**
 * GET /api/admin/logs
 * 获取操作记录（支持类型筛选）
 */
router.get('/logs', (req, res) => {
  try {
    const { operation_type, target_type, page = 1, page_size = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);

    let whereClause = '1=1';
    const params = [];

    if (operation_type) {
      whereClause += ' AND operation_type = ?';
      params.push(operation_type);
    }
    if (target_type) {
      whereClause += ' AND target_type = ?';
      params.push(target_type);
    }

    const total = db.prepare(`SELECT COUNT(*) AS count FROM operation_logs WHERE ${whereClause}`).get(...params).count;

    const logs = db.prepare(`
      SELECT * FROM operation_logs
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(page_size), offset);

    return success(res, {
      list: logs,
      total,
      page: parseInt(page),
      page_size: parseInt(page_size)
    });
  } catch (err) {
    console.error('获取操作记录失败:', err);
    return fail(res, '获取操作记录失败，服务器错误');
  }
});

/**
 * GET /api/admin/rooms
 * 获取诊室列表
 */
router.get('/rooms', (req, res) => {
  try {
    const rooms = db.prepare(`
      SELECT r.id, r.name, r.display_code, r.current_doctor_id, r.created_at,
             a.name AS doctor_name, a.title AS doctor_title, a.specialty AS doctor_specialty
      FROM rooms r
      LEFT JOIN accounts a ON r.current_doctor_id = a.id
      ORDER BY r.id ASC
    `).all();

    return success(res, rooms);
  } catch (err) {
    console.error('获取诊室列表失败:', err);
    return fail(res, '获取诊室列表失败，服务器错误');
  }
});

/**
 * POST /api/admin/rooms
 * 创建诊室
 */
router.post('/rooms', (req, res) => {
  try {
    const { name, display_code } = req.body;

    if (!name) {
      return fail(res, '请输入诊室名称');
    }

    const result = db.prepare(`
      INSERT INTO rooms (name, display_code) VALUES (?, ?)
    `).run(name, display_code || '');

    logOperation(
      req.user.id, req.user.name,
      'create_room', 'room', result.lastInsertRowid,
      { name, display_code }
    );

    return success(res, { id: result.lastInsertRowid }, '诊室创建成功');
  } catch (err) {
    console.error('创建诊室失败:', err);
    return fail(res, '创建诊室失败，服务器错误');
  }
});

/**
 * PUT /api/admin/rooms/:id
 * 编辑诊室（绑定显示屏、绑定医生）
 */
router.put('/rooms/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, display_code, current_doctor_id } = req.body;

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    if (!room) {
      return fail(res, '诊室不存在');
    }

    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (display_code !== undefined) { updates.push('display_code = ?'); values.push(display_code); }
    if (current_doctor_id !== undefined) { updates.push('current_doctor_id = ?'); values.push(current_doctor_id || null); }

    if (updates.length === 0) {
      return fail(res, '没有需要修改的字段');
    }

    values.push(id);
    db.prepare(`UPDATE rooms SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logOperation(
      req.user.id, req.user.name,
      'update_room', 'room', parseInt(id),
      { name, display_code, current_doctor_id }
    );

    return success(res, null, '诊室信息已更新');
  } catch (err) {
    console.error('编辑诊室失败:', err);
    return fail(res, '编辑诊室失败，服务器错误');
  }
});

/**
 * POST /api/admin/scores/:account_id
 * 管理员给某账号打主观评价分
 */
router.post('/scores/:account_id', (req, res) => {
  try {
    const { account_id } = req.params;
    const { subjective_score } = req.body;

    if (subjective_score === undefined || subjective_score === null) {
      return fail(res, '请输入主观评价分');
    }

    const scoreVal = parseFloat(subjective_score);
    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > 100) {
      return fail(res, '主观评价分必须在 0-100 之间');
    }

    // 验证账号存在
    const account = db.prepare('SELECT id, name FROM accounts WHERE id = ?').get(account_id);
    if (!account) {
      return fail(res, '账号不存在');
    }

    const today = getTodayStr();

    // 查找或创建今日成绩记录
    const existing = db.prepare(`
      SELECT id, volume_score, attendance_score FROM scores
      WHERE account_id = ? AND score_date = ?
    `).get(account_id, today);

    if (existing) {
      const totalScore = existing.volume_score + existing.attendance_score + scoreVal;
      db.prepare(`
        UPDATE scores SET subjective_score = ?, total_score = ? WHERE id = ?
      `).run(scoreVal, totalScore, existing.id);
    } else {
      db.prepare(`
        INSERT INTO scores (account_id, score_date, subjective_score, total_score)
        VALUES (?, ?, ?, ?)
      `).run(account_id, today, scoreVal, scoreVal);
    }

    logOperation(
      req.user.id, req.user.name,
      'score_subjective', 'account', parseInt(account_id),
      { target_name: account.name, subjective_score: scoreVal }
    );

    return success(res, null, `已给 ${account.name} 打分: ${scoreVal}`);
  } catch (err) {
    console.error('打分失败:', err);
    return fail(res, '打分失败，服务器错误');
  }
});

/**
 * PUT /api/admin/doctors/:id/profile
 * 更新医生简历信息（照片、职称、擅长领域等）
 */
router.put('/doctors/:id/profile', (req, res) => {
  try {
    const { id } = req.params;
    const { avatar_path, title, specialty, bio } = req.body;

    // 验证是医生账号
    const doctor = db.prepare(`
      SELECT id, name FROM accounts WHERE id = ? AND role = 'doctor'
    `).get(id);

    if (!doctor) {
      return fail(res, '医生账号不存在');
    }

    const updates = [];
    const values = [];

    if (avatar_path !== undefined) { updates.push('avatar_path = ?'); values.push(avatar_path); }
    if (title !== undefined) { updates.push('title = ?'); values.push(title); }
    if (specialty !== undefined) { updates.push('specialty = ?'); values.push(specialty); }
    if (bio !== undefined) { updates.push('bio = ?'); values.push(bio); }

    if (updates.length === 0) {
      return fail(res, '没有需要修改的字段');
    }

    updates.push("updated_at = datetime('now', 'localtime')");
    values.push(id);

    db.prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logOperation(
      req.user.id, req.user.name,
      'update_doctor_profile', 'account', parseInt(id),
      { doctor_name: doctor.name, changes: req.body }
    );

    return success(res, null, '医生简历信息已更新');
  } catch (err) {
    console.error('更新医生简历失败:', err);
    return fail(res, '更新医生简历失败，服务器错误');
  }
});

/**
 * GET /api/admin/export/patients
 * 导出今日患者信息为 CSV
 */
router.get('/export/patients', (req, res) => {
  try {
    const today = getTodayStr();

    // 查询今日所有患者信息
    const patients = db.prepare(`
      SELECT
        p.id,
        p.name,
        p.age,
        p.symptom_name,
        p.symptoms,
        p.ticket_number,
        p.source,
        p.is_reserved,
        a.name AS doctor_name,
        p.status,
        p.created_at,
        p.remarks
      FROM patients p
      LEFT JOIN accounts a ON p.doctor_id = a.id
      WHERE p.created_at LIKE ?
      ORDER BY p.created_at ASC
    `).all(`${today}%`);

    // CSV 表头
    const headers = [
      '编号', '姓名', '年龄', '病症', '症状描述', '号码牌',
      '来源', '是否预约', '就诊医生', '状态', '创建时间', '备注'
    ];

    // 状态映射
    const statusMap = {
      'waiting': '等待中',
      'calling': '叫号中',
      'done': '已完成',
      'skipped': '已跳过'
    };

    // 构建 CSV 行
    const rows = patients.map((p) => {
      return [
        p.id,
        p.name || '',
        p.age || '',
        p.symptom_name || '',
        p.symptoms || '',
        p.ticket_number || '',
        p.source || '',
        p.is_reserved ? '是' : '否',
        p.doctor_name || '',
        statusMap[p.status] || p.status || '',
        p.created_at || '',
        p.remarks || ''
      ].map((field) => {
        // 处理包含逗号、引号或换行符的字段
        const str = String(field || '');
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      }).join(',');
    });

    // 添加 BOM 确保 Excel 正确显示中文
    const bom = '\uFEFF';
    const csvContent = bom + headers.join(',') + '\n' + rows.join('\n');

    // 设置响应头
    const filename = `patients_${today}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    return res.send(csvContent);
  } catch (err) {
    console.error('导出患者信息失败:', err);
    return fail(res, '导出患者信息失败，服务器错误');
  }
});

module.exports = router;

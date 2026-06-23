/**
 * 医生路由（需要 doctor 角色）
 * - GET  /api/doctor/today       获取今日接诊概况
 * - POST /api/doctor/call-next   叫下一位
 * - POST /api/doctor/skip        跳过当前患者
 * - GET  /api/doctor/timeline    获取今日接诊时间轴
 * - POST /api/doctor/off-work    下班
 * - GET  /api/doctor/summary     获取下班成绩单
 */
const express = require('express');
const router = express.Router();
const { db, success, fail, logOperation, getTodayStr, maskName } = require('../database');
const { verifyToken, roleCheck } = require('../middleware');

// 所有路由需要认证 + 医生角色
router.use(verifyToken, roleCheck(['doctor']));

/**
 * 获取 WebSocket 广播函数（在 app.js 中设置）
 */
let broadcastToRoom = null;
function setBroadcastFn(fn) {
  broadcastToRoom = fn;
}

/**
 * GET /api/doctor/today
 * 获取今日接诊概况（已接诊数、当前患者等）
 */
router.get('/today', (req, res) => {
  try {
    const today = getTodayStr();
    const doctorId = req.user.id;

    // 今日总患者数
    const totalCount = db.prepare(`
      SELECT COUNT(*) AS count FROM patients
      WHERE doctor_id = ? AND created_at LIKE ?
    `).get(doctorId, `${today}%`).count;

    // 已完成数
    const doneCount = db.prepare(`
      SELECT COUNT(*) AS count FROM patients
      WHERE doctor_id = ? AND created_at LIKE ? AND status = 'done'
    `).get(doctorId, `${today}%`).count;

    // 等待中数
    const waitingCount = db.prepare(`
      SELECT COUNT(*) AS count FROM patients
      WHERE doctor_id = ? AND created_at LIKE ? AND status = 'waiting'
    `).get(doctorId, `${today}%`).count;

    // 跳过数
    const skippedCount = db.prepare(`
      SELECT COUNT(*) AS count FROM patients
      WHERE doctor_id = ? AND created_at LIKE ? AND status = 'skipped'
    `).get(doctorId, `${today}%`).count;

    // 当前正在叫号的患者
    const currentPatient = db.prepare(`
      SELECT p.id, p.name, p.age, p.symptom_name, p.symptoms, p.ticket_number,
             p.visit_history, p.remarks, p.source, p.is_reserved
      FROM patients p
      WHERE p.doctor_id = ? AND p.status = 'calling' AND p.created_at LIKE ?
      ORDER BY p.ticket_number ASC LIMIT 1
    `).get(doctorId, `${today}%`);

    // 等待队列（下几位）
    const waitingList = db.prepare(`
      SELECT p.id, p.name, p.age, p.symptom_name, p.ticket_number, p.is_reserved
      FROM patients p
      WHERE p.doctor_id = ? AND p.status = 'waiting' AND p.created_at LIKE ?
      ORDER BY p.ticket_number ASC LIMIT 10
    `).all(doctorId, `${today}%`).map(p => ({
      ...p,
      name: maskName(p.name)
    }));

    const result = {
      total_count: totalCount,
      done_count: doneCount,
      waiting_count: waitingCount,
      skipped_count: skippedCount,
      current_patient: currentPatient ? {
        ...currentPatient,
        name: maskName(currentPatient.name)
      } : null,
      waiting_list: waitingList
    };

    return success(res, result);
  } catch (err) {
    console.error('获取今日概况失败:', err);
    return fail(res, '获取今日概况失败，服务器错误');
  }
});

/**
 * POST /api/doctor/call-next
 * 叫下一位（更新患者状态、创建 call_record、通过 WebSocket 通知）
 */
router.post('/call-next', (req, res) => {
  try {
    const today = getTodayStr();
    const doctorId = req.user.id;

    // 先将当前 calling 状态的患者标记为 done
    db.prepare(`
      UPDATE patients SET status = 'done', updated_at = datetime('now', 'localtime')
      WHERE doctor_id = ? AND status = 'calling' AND created_at LIKE ?
    `).run(doctorId, `${today}%`);

    // 将当前 calling 状态的 call_record 标记为 completed
    db.prepare(`
      UPDATE call_records SET status = 'completed', end_time = datetime('now', 'localtime')
      WHERE doctor_id = ? AND status = 'calling'
    `).run(doctorId);

    // 查找下一位等待中的患者
    const nextPatient = db.prepare(`
      SELECT * FROM patients
      WHERE doctor_id = ? AND status = 'waiting' AND created_at LIKE ?
      ORDER BY ticket_number ASC LIMIT 1
    `).get(doctorId, `${today}%`);

    if (!nextPatient) {
      // 没有等待的患者，记录日志
      logOperation(doctorId, req.user.name, 'call_next_empty', 'patient', null, null);
      return success(res, null, '当前没有等待的患者');
    }

    // 更新患者状态为 calling
    db.prepare(`
      UPDATE patients SET status = 'calling', updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(nextPatient.id);

    // 创建叫号记录
    db.prepare(`
      INSERT INTO call_records (patient_id, doctor_id, call_time, start_time, status)
      VALUES (?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'), 'calling')
    `).run(nextPatient.id, doctorId);

    // 记录操作日志
    logOperation(
      doctorId, req.user.name,
      'call_patient', 'patient', nextPatient.id,
      { ticket_number: nextPatient.ticket_number, patient_name: maskName(nextPatient.name) }
    );

    // 通过 WebSocket 推送叫号信息到诊室显示屏
    if (broadcastToRoom && req.user.room_id) {
      broadcastToRoom(req.user.room_id, {
        type: 'call_update',
        room_id: req.user.room_id,
        data: {
          ticket_number: nextPatient.ticket_number,
          patient_name_masked: maskName(nextPatient.name),
          doctor_name: req.user.name
        }
      });
    }

    return success(res, {
      id: nextPatient.id,
      ticket_number: nextPatient.ticket_number,
      name: maskName(nextPatient.name),
      age: nextPatient.age,
      symptom_name: nextPatient.symptom_name
    }, `正在叫号: ${nextPatient.ticket_number}`);
  } catch (err) {
    console.error('叫号失败:', err);
    return fail(res, '叫号失败，服务器错误');
  }
});

/**
 * POST /api/doctor/skip
 * 跳过当前患者
 */
router.post('/skip', (req, res) => {
  try {
    const today = getTodayStr();
    const doctorId = req.user.id;

    // 查找当前 calling 状态的患者
    const currentPatient = db.prepare(`
      SELECT * FROM patients
      WHERE doctor_id = ? AND status = 'calling' AND created_at LIKE ?
      ORDER BY ticket_number ASC LIMIT 1
    `).get(doctorId, `${today}%`);

    if (!currentPatient) {
      return fail(res, '当前没有正在叫号的患者');
    }

    // 更新患者状态为 skipped
    db.prepare(`
      UPDATE patients SET status = 'skipped', updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(currentPatient.id);

    // 更新 call_record 状态
    db.prepare(`
      UPDATE call_records SET status = 'skipped', end_time = datetime('now', 'localtime')
      WHERE patient_id = ? AND doctor_id = ? AND status = 'calling'
    `).run(currentPatient.id, doctorId);

    // 记录操作日志
    logOperation(
      doctorId, req.user.name,
      'skip_patient', 'patient', currentPatient.id,
      { ticket_number: currentPatient.ticket_number, patient_name: maskName(currentPatient.name) }
    );

    return success(res, null, `已跳过患者 ${currentPatient.ticket_number}`);
  } catch (err) {
    console.error('跳过患者失败:', err);
    return fail(res, '跳过患者失败，服务器错误');
  }
});

/**
 * GET /api/doctor/timeline
 * 获取今日接诊时间轴数据
 */
router.get('/timeline', (req, res) => {
  try {
    const today = getTodayStr();
    const doctorId = req.user.id;

    // 获取今日所有叫号记录
    const records = db.prepare(`
      SELECT cr.id, cr.patient_id, cr.call_time, cr.start_time, cr.end_time, cr.status,
             p.ticket_number, p.name AS patient_name, p.symptom_name
      FROM call_records cr
      LEFT JOIN patients p ON cr.patient_id = p.id
      WHERE cr.doctor_id = ? AND cr.call_time LIKE ?
      ORDER BY cr.call_time ASC
    `).all(doctorId, `${today}%`).map(r => ({
      ...r,
      patient_name: maskName(r.patient_name)
    }));

    return success(res, records);
  } catch (err) {
    console.error('获取时间轴失败:', err);
    return fail(res, '获取时间轴失败，服务器错误');
  }
});

/**
 * POST /api/doctor/off-work
 * 下班（记录下班时间、生成成绩单数据）
 */
router.post('/off-work', (req, res) => {
  try {
    const today = getTodayStr();
    const doctorId = req.user.id;

    // 将当前 calling 状态的患者标记为 done
    db.prepare(`
      UPDATE patients SET status = 'done', updated_at = datetime('now', 'localtime')
      WHERE doctor_id = ? AND status = 'calling' AND created_at LIKE ?
    `).run(doctorId, `${today}%`);

    // 将当前 calling 状态的 call_record 标记为 completed
    db.prepare(`
      UPDATE call_records SET status = 'completed', end_time = datetime('now', 'localtime')
      WHERE doctor_id = ? AND status = 'calling'
    `).run(doctorId);

    // 更新工作会话为 inactive
    db.prepare(`
      UPDATE work_sessions SET logout_time = datetime('now', 'localtime'), status = 'inactive'
      WHERE account_id = ? AND status = 'active' AND login_time LIKE ?
    `).run(doctorId, `${today}%`);

    // 计算今日成绩
    const session = db.prepare(`
      SELECT login_time, logout_time FROM work_sessions
      WHERE account_id = ? AND login_time LIKE ?
      ORDER BY login_time DESC LIMIT 1
    `).get(doctorId, `${today}%`);

    const doneCount = db.prepare(`
      SELECT COUNT(*) AS count FROM patients
      WHERE doctor_id = ? AND created_at LIKE ? AND status = 'done'
    `).get(doctorId, `${today}%`).count;

    const skippedCount = db.prepare(`
      SELECT COUNT(*) AS count FROM patients
      WHERE doctor_id = ? AND created_at LIKE ? AND status = 'skipped'
    `).get(doctorId, `${today}%`).count;

    const totalCount = doneCount + skippedCount;

    // 计算出勤分（基于工作时长，8小时满分100）
    let attendanceScore = 0;
    if (session && session.login_time && session.logout_time) {
      const loginTime = new Date(session.login_time);
      const logoutTime = new Date(session.logout_time);
      const workHours = (logoutTime - loginTime) / (1000 * 60 * 60);
      attendanceScore = Math.min(100, Math.round((workHours / 8) * 100));
    }

    // 计算接诊量分（基于接诊数量，40人满分100）
    const volumeScore = Math.min(100, Math.round((doneCount / 40) * 100));

    // 查找是否已有今日成绩记录
    const existingScore = db.prepare(`
      SELECT id FROM scores WHERE account_id = ? AND score_date = ?
    `).get(doctorId, today);

    if (existingScore) {
      db.prepare(`
        UPDATE scores SET
          volume_score = ?, attendance_score = ?,
          total_score = ?,
          created_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(volumeScore, attendanceScore, volumeScore + attendanceScore, existingScore.id);
    } else {
      db.prepare(`
        INSERT INTO scores (account_id, score_date, volume_score, attendance_score, total_score)
        VALUES (?, ?, ?, ?, ?)
      `).run(doctorId, today, volumeScore, attendanceScore, volumeScore + attendanceScore);
    }

    // 记录操作日志
    logOperation(
      doctorId, req.user.name,
      'off_work', 'work_session', doctorId,
      { done_count: doneCount, skipped_count: skippedCount, volume_score: volumeScore, attendance_score: attendanceScore }
    );

    return success(res, {
      done_count: doneCount,
      skipped_count: skippedCount,
      total_count: totalCount,
      volume_score: volumeScore,
      attendance_score: attendanceScore,
      total_score: volumeScore + attendanceScore
    }, '已记录下班');
  } catch (err) {
    console.error('下班操作失败:', err);
    return fail(res, '下班操作失败，服务器错误');
  }
});

/**
 * GET /api/doctor/summary
 * 获取下班成绩单
 */
router.get('/summary', (req, res) => {
  try {
    const today = getTodayStr();
    const doctorId = req.user.id;

    // 获取今日成绩
    const score = db.prepare(`
      SELECT * FROM scores WHERE account_id = ? AND score_date = ?
    `).get(doctorId, today);

    // 获取今日工作会话
    const session = db.prepare(`
      SELECT * FROM work_sessions WHERE account_id = ? AND login_time LIKE ?
      ORDER BY login_time DESC LIMIT 1
    `).get(doctorId, `${today}%`);

    // 获取今日接诊统计
    const stats = db.prepare(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'done') AS done_count,
        COUNT(*) FILTER (WHERE status = 'waiting') AS waiting_count,
        COUNT(*) FILTER (WHERE status = 'calling') AS calling_count,
        COUNT(*) FILTER (WHERE status = 'skipped') AS skipped_count
      FROM patients WHERE doctor_id = ? AND created_at LIKE ?
    `).get(doctorId, `${today}%`);

    // 获取随机励志语
    const quote = db.prepare(`
      SELECT content, author FROM motivational_quotes ORDER BY RANDOM() LIMIT 1
    `).get();

    return success(res, {
      score: score || { volume_score: 0, attendance_score: 0, subjective_score: 0, total_score: 0 },
      session,
      stats,
      quote
    });
  } catch (err) {
    console.error('获取成绩单失败:', err);
    return fail(res, '获取成绩单失败，服务器错误');
  }
});

module.exports = router;
module.exports.setBroadcastFn = setBroadcastFn;

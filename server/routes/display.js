/**
 * 显示屏路由（公开，无需认证）
 * - GET /api/display/:room_id  获取某诊室的显示屏数据
 */
const express = require('express');
const router = express.Router();
const { db, success, fail, maskName } = require('../database');

/**
 * GET /api/display/:room_id
 * 获取某诊室的显示屏数据（医生信息 + 当前叫号信息）
 */
router.get('/:room_id', (req, res) => {
  try {
    const { room_id } = req.params;

    // 查询诊室信息
    const room = db.prepare(`
      SELECT r.id, r.name, r.display_code, r.current_doctor_id
      FROM rooms r WHERE r.id = ?
    `).get(room_id);

    if (!room) {
      return fail(res, '诊室不存在');
    }

    // 查询诊室当前医生信息
    let doctor = null;
    if (room.current_doctor_id) {
      doctor = db.prepare(`
        SELECT id, name, title, specialty, avatar_path
        FROM accounts WHERE id = ? AND status = 'active'
      `).get(room.current_doctor_id);
    }

    // 查询当前正在叫号的患者
    const currentPatient = db.prepare(`
      SELECT p.ticket_number, p.name, p.symptom_name, p.created_at
      FROM patients p
      WHERE p.doctor_id = ? AND p.status = 'calling'
      ORDER BY p.ticket_number DESC LIMIT 1
    `).get(room.current_doctor_id);

    // 查询等待队列数量
    const waitingCount = db.prepare(`
      SELECT COUNT(*) AS count FROM patients
      WHERE doctor_id = ? AND status = 'waiting'
    `).get(room.current_doctor_id).count;

    // 获取随机励志语
    const quote = db.prepare(`
      SELECT content, author FROM motivational_quotes ORDER BY RANDOM() LIMIT 1
    `).get();

    const displayData = {
      room: {
        id: room.id,
        name: room.name,
        display_code: room.display_code
      },
      doctor: doctor ? {
        id: doctor.id,
        name: doctor.name,
        title: doctor.title,
        specialty: doctor.specialty,
        avatar_path: doctor.avatar_path
      } : null,
      current_patient: currentPatient ? {
        ticket_number: currentPatient.ticket_number,
        patient_name_masked: maskName(currentPatient.name),
        symptom_name: currentPatient.symptom_name
      } : null,
      waiting_count: waitingCount,
      quote: quote || null
    };

    return success(res, displayData);
  } catch (err) {
    console.error('获取显示屏数据失败:', err);
    return fail(res, '获取显示屏数据失败，服务器错误');
  }
});

module.exports = router;

/**
 * 认证路由
 * - POST /api/auth/login        登录
 * - POST /api/auth/change-password  修改密码
 * - POST /api/auth/reset-password   管理员重置他人密码
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { db, success, fail, logOperation, getTodayStr } = require('../database');
const { generateToken, verifyToken, roleCheck } = require('../middleware');

/**
 * POST /api/auth/login
 * 登录接口，返回 JWT token 和用户信息
 */
router.post('/login', (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return fail(res, '请输入手机号和密码');
    }

    // 查询账号
    const account = db.prepare(`
      SELECT id, name, phone, password, role, room_id, status, avatar_path, title, specialty, bio
      FROM accounts WHERE phone = ?
    `).get(phone);

    if (!account) {
      return fail(res, '账号不存在');
    }

    if (account.status !== 'active') {
      return fail(res, '账号已被停用，请联系管理员');
    }

    // 验证密码
    const isMatch = bcrypt.compareSync(password, account.password);
    if (!isMatch) {
      return fail(res, '密码错误');
    }

    // 记录登录时间 - 创建工作会话
    const today = getTodayStr();
    const existingSession = db.prepare(`
      SELECT id FROM work_sessions
      WHERE account_id = ? AND status = 'active' AND login_time LIKE ?
    `).get(account.id, `${today}%`);

    if (!existingSession) {
      db.prepare(`
        INSERT INTO work_sessions (account_id, status) VALUES (?, 'active')
      `).run(account.id);
    }

    // 生成 JWT Token
    const token = generateToken({
      id: account.id,
      phone: account.phone,
      role: account.role
    });

    // 返回用户信息（不含密码）
    const userInfo = {
      id: account.id,
      name: account.name,
      phone: account.phone,
      role: account.role,
      room_id: account.room_id,
      avatar_path: account.avatar_path,
      title: account.title,
      specialty: account.specialty,
      bio: account.bio,
      token
    };

    // 记录操作日志
    logOperation(account.id, account.name, 'login', 'account', account.id, { phone });

    return success(res, userInfo, '登录成功');
  } catch (err) {
    console.error('登录失败:', err);
    return fail(res, '登录失败，服务器错误');
  }
});

/**
 * POST /api/auth/change-password
 * 修改密码（需要旧密码验证）
 */
router.post('/change-password', verifyToken, (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return fail(res, '请输入旧密码和新密码');
    }

    if (newPassword.length < 6) {
      return fail(res, '新密码长度不能少于6位');
    }

    // 查询当前密码
    const account = db.prepare('SELECT password FROM accounts WHERE id = ?').get(req.user.id);
    if (!account) {
      return fail(res, '账号不存在');
    }

    // 验证旧密码
    const isMatch = bcrypt.compareSync(oldPassword, account.password);
    if (!isMatch) {
      return fail(res, '旧密码错误');
    }

    // 哈希新密码
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    // 更新密码
    db.prepare(`
      UPDATE accounts SET password = ?, updated_at = datetime('now', 'localtime') WHERE id = ?
    `).run(hashedPassword, req.user.id);

    // 记录操作日志
    logOperation(req.user.id, req.user.name, 'change_password', 'account', req.user.id, null);

    return success(res, null, '密码修改成功');
  } catch (err) {
    console.error('修改密码失败:', err);
    return fail(res, '修改密码失败，服务器错误');
  }
});

/**
 * POST /api/auth/reset-password
 * 管理员重置他人密码为 123456
 */
router.post('/reset-password', verifyToken, roleCheck(['admin']), (req, res) => {
  try {
    const { account_id } = req.body;

    if (!account_id) {
      return fail(res, '请指定要重置密码的账号ID');
    }

    // 查询目标账号
    const targetAccount = db.prepare(`
      SELECT id, name, phone FROM accounts WHERE id = ?
    `).get(account_id);

    if (!targetAccount) {
      return fail(res, '目标账号不存在');
    }

    // 重置密码为 123456
    const newPassword = bcrypt.hashSync('123456', 10);
    db.prepare(`
      UPDATE accounts SET password = ?, updated_at = datetime('now', 'localtime') WHERE id = ?
    `).run(newPassword, account_id);

    // 记录操作日志
    logOperation(
      req.user.id, req.user.name,
      'reset_password', 'account', account_id,
      { target_name: targetAccount.name, target_phone: targetAccount.phone }
    );

    return success(res, null, `已将 ${targetAccount.name} 的密码重置为 123456`);
  } catch (err) {
    console.error('重置密码失败:', err);
    return fail(res, '重置密码失败，服务器错误');
  }
});

module.exports = router;

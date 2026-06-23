/**
 * JWT 认证中间件
 */
const jwt = require('jsonwebtoken');
const { db, fail } = require('./database');

// JWT 密钥
const JWT_SECRET = 'hospital-calling-system-secret-key-2026';
// Token 有效期: 24小时
const JWT_EXPIRES_IN = '24h';

/**
 * 生成 JWT Token
 * @param {Object} payload - 载荷数据
 * @returns {string} JWT token
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * 验证 Token 中间件
 * 从 Authorization header 获取 token，验证并挂载 req.user
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return fail(res, '未提供认证令牌，请先登录', 401);
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // 从数据库中查询用户最新信息，确保账号状态有效
    const user = db.prepare(`
      SELECT id, name, phone, role, room_id, status, avatar_path, title, specialty, bio
      FROM accounts WHERE id = ? AND status = 'active'
    `).get(decoded.id);

    if (!user) {
      return fail(res, '账号已被停用或不存在', 401);
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return fail(res, '登录已过期，请重新登录', 401);
    }
    return fail(res, '无效的认证令牌', 401);
  }
}

/**
 * 角色检查中间件工厂
 * @param {string[]} roles - 允许的角色列表
 * @returns {Function} Express 中间件
 */
function roleCheck(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return fail(res, '未认证，请先登录', 401);
    }

    if (!roles.includes(req.user.role)) {
      return fail(res, '权限不足，无权访问该资源', 403);
    }

    next();
  };
}

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  generateToken,
  verifyToken,
  roleCheck
};

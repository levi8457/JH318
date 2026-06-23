/**
 * 医院呼叫系统 - 主应用入口
 * 初始化 Express app，挂载路由，集成 WebSocket，监听端口 3000
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

// 创建 Express 应用
const app = express();
const PORT = process.env.PORT || 3000;

// ==================== 中间件 ====================

// JSON 解析
app.use(express.json({ limit: '10mb' }));

// 静态文件服务 - public 目录
const publicPath = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
}

// CORS 支持（开发环境）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 请求日志（开发环境）
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 500) {
      console.log(`[SLOW] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// ==================== 启动时创建 data 目录 ====================
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`[启动] 已创建数据目录: ${dataDir}`);
}

// ==================== 初始化数据库 ====================
// database.js 在 require 时会自动创建表
const { db } = require('./database');
console.log('[启动] 数据库连接成功');

// ==================== 挂载路由 ====================

// 认证路由（公开）
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// 导诊护士路由
const nurseRoutes = require('./routes/nurse');
app.use('/api/nurse', nurseRoutes);

// 医生路由
const doctorRoutes = require('./routes/doctor');
app.use('/api/doctor', doctorRoutes);

// 管理员路由
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

// 显示屏路由（公开）
const displayRoutes = require('./routes/display');
app.use('/api/display', displayRoutes);

// ==================== 创建 HTTP Server ====================
const server = http.createServer(app);

// ==================== 集成 WebSocket ====================
const { initWebSocket, broadcastToRoom } = require('./websocket');
initWebSocket(server);

// 将 broadcastToRoom 注入到 doctor 路由
const doctorModule = require('./routes/doctor');
doctorModule.setBroadcastFn(broadcastToRoom);

// ==================== 错误处理 ====================

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    code: 1,
    message: `接口不存在: ${req.method} ${req.url}`,
    data: null
  });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('[错误]', err.stack);
  res.status(500).json({
    code: 1,
    message: '服务器内部错误',
    data: null
  });
});

// ==================== 启动服务 ====================
server.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  医院呼叫系统已启动');
  console.log(`  服务地址: http://localhost:${PORT}`);
  console.log(`  WebSocket: ws://localhost:${PORT}/ws`);
  console.log('========================================');
  console.log('');
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[关闭] 正在关闭服务器...');
  server.close(() => {
    db.close();
    console.log('[关闭] 服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n[关闭] 正在关闭服务器...');
  server.close(() => {
    db.close();
    console.log('[关闭] 服务器已关闭');
    process.exit(0);
  });
});

module.exports = { app, server };

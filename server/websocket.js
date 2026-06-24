/**
 * WebSocket 服务
 * 支持两种订阅模式：
 * 1. room_id 模式：?room_id=1（传统方式，兼容现有显示屏）
 * 2. doctor_id 模式：?doctor_id=1（新方式，医生登录后自动关联）
 *
 * 消息格式: { type: 'call_update', room_id, data: { ticket_number, patient_name_masked, doctor_name } }
 */
const WebSocket = require('ws');

let wss = null;

/**
 * 初始化 WebSocket 服务，挂载到 HTTP server 上
 * @param {http.Server} server - HTTP server 实例
 */
function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    console.log(`[WebSocket] 新客户端连接: ${req.socket.remoteAddress}`);

    // 解析 URL 参数获取 room_id 和 doctor_id
    const url = new URL(req.url, `http://${req.headers.host}`);
    const roomId = url.searchParams.get('room_id');
    const doctorId = url.searchParams.get('doctor_id');

    if (roomId) {
      ws.roomId = parseInt(roomId);
      ws.isAlive = true;
      console.log(`[WebSocket] 客户端订阅诊室: room_id=${roomId}`);
    }

    if (doctorId) {
      ws.doctorId = parseInt(doctorId);
      ws.isAlive = true;
      console.log(`[WebSocket] 客户端订阅医生: doctor_id=${doctorId}`);
    }

    // 心跳检测
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      console.log(`[WebSocket] 客户端断开连接: room_id=${ws.roomId || '未订阅'}, doctor_id=${ws.doctorId || '未订阅'}`);
    });

    ws.on('error', (err) => {
      console.error(`[WebSocket] 连接错误:`, err.message);
    });
  });

  // 定期清理断开的连接
  const heartbeatInterval = setInterval(() => {
    if (wss) {
      wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  console.log('[WebSocket] 服务已启动，路径: /ws');
}

/**
 * 向指定诊室的所有显示屏客户端广播消息
 * @param {number} roomId - 诊室ID
 * @param {Object} message - 消息内容
 */
function broadcastToRoom(roomId, message) {
  if (!wss) {
    console.warn('[WebSocket] 服务未初始化，无法推送消息');
    return;
  }

  const messageStr = JSON.stringify(message);
  let sentCount = 0;

  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN && ws.roomId === roomId) {
      ws.send(messageStr);
      sentCount++;
    }
  });

  console.log(`[WebSocket] 向诊室 ${roomId} 推送消息，已发送 ${sentCount} 个客户端:`, message.type);
}

/**
 * 向指定医生的所有显示屏客户端广播消息
 * @param {number} doctorId - 医生ID
 * @param {Object} message - 消息内容
 */
function broadcastToDoctor(doctorId, message) {
  if (!wss) {
    console.warn('[WebSocket] 服务未初始化，无法推送消息');
    return;
  }

  const messageStr = JSON.stringify(message);
  let sentCount = 0;

  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN && ws.doctorId === doctorId) {
      ws.send(messageStr);
      sentCount++;
    }
  });

  console.log(`[WebSocket] 向医生 ${doctorId} 推送消息，已发送 ${sentCount} 个客户端:`, message.type);
}

/**
 * 获取 WebSocket 服务器实例
 */
function getWSS() {
  return wss;
}

module.exports = {
  initWebSocket,
  broadcastToRoom,
  broadcastToDoctor,
  getWSS
};

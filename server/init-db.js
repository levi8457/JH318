/**
 * 初始化数据库脚本
 * 创建默认管理员、示例诊室、示例医生和护士
 */
const bcrypt = require('bcryptjs');
const { db, logOperation } = require('./database');

async function initDB() {
  console.log('开始初始化数据库...');

  // 检查是否已有管理员账号
  const existingAdmin = db.prepare("SELECT id FROM accounts WHERE phone = 'admin'").get();
  if (existingAdmin) {
    console.log('数据库已初始化，跳过。如需重新初始化，请先删除 data/hospital.db 文件。');
    process.exit(0);
  }

  // ==================== 创建默认管理员 ====================
  const adminPassword = await bcrypt.hash('admin123', 10);
  db.prepare(`
    INSERT INTO accounts (name, phone, password, role, status)
    VALUES (?, ?, ?, ?, ?)
  `).run('系统管理员', 'admin', adminPassword, 'admin', 'active');
  console.log('已创建默认管理员账号: admin / admin123');

  // ==================== 创建示例诊室 ====================
  const room1 = db.prepare(`INSERT INTO rooms (name, display_code) VALUES (?, ?)`).run('诊室一', 'ROOM-001');
  const room2 = db.prepare(`INSERT INTO rooms (name, display_code) VALUES (?, ?)`).run('诊室二', 'ROOM-002');
  const room3 = db.prepare(`INSERT INTO rooms (name, display_code) VALUES (?, ?)`).run('诊室三', 'ROOM-003');
  console.log('已创建3个示例诊室');

  // ==================== 创建示例医生 ====================
  const doctor1Password = await bcrypt.hash('123456', 10);
  const doctor1 = db.prepare(`
    INSERT INTO accounts (name, phone, password, role, room_id, status, title, specialty, bio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    '王建国', '13800000001', doctor1Password, 'doctor', room1.lastInsertRowid, 'active',
    '主任医师', '心血管内科', '从事心血管内科临床工作20余年，擅长冠心病、高血压、心律失常的诊治。'
  );

  const doctor2Password = await bcrypt.hash('123456', 10);
  const doctor2 = db.prepare(`
    INSERT INTO accounts (name, phone, password, role, room_id, status, title, specialty, bio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    '李明华', '13800000002', doctor2Password, 'doctor', room2.lastInsertRowid, 'active',
    '副主任医师', '消化内科', '擅长消化系统疾病的诊断与治疗，精通胃肠镜检查。'
  );
  console.log('已创建2个示例医生: 13800000001/13800000002 / 123456');

  // 更新诊室的当前医生
  db.prepare(`UPDATE rooms SET current_doctor_id = ? WHERE id = ?`).run(doctor1.lastInsertRowid, room1.lastInsertRowid);
  db.prepare(`UPDATE rooms SET current_doctor_id = ? WHERE id = ?`).run(doctor2.lastInsertRowid, room2.lastInsertRowid);

  // ==================== 创建示例护士 ====================
  const nursePassword = await bcrypt.hash('123456', 10);
  db.prepare(`
    INSERT INTO accounts (name, phone, password, role, status)
    VALUES (?, ?, ?, ?, ?)
  `).run('赵小燕', '13800000003', nursePassword, 'nurse', 'active');
  console.log('已创建1个示例护士: 13800000003 / 123456');

  // ==================== 创建示例励志语 ====================
  const quotes = [
    { content: '生命在于运动，健康在于预防。', author: '医学格言', category: '健康' },
    { content: '早睡早起身体好，按时吃饭精神高。', author: '民间谚语', category: '健康' },
    { content: '预防胜于治疗，养生重于治病。', author: '中医理念', category: '养生' },
    { content: '每天一杯水，医生远离我。', author: '健康口诀', category: '健康' },
    { content: '心态平和，百病不生。', author: '养生之道', category: '心态' },
    { content: '最好的医生是自己，最好的药物是时间。', author: '医学名言', category: '哲理' },
    { content: '笑一笑，十年少；愁一愁，白了头。', author: '民间谚语', category: '心态' },
    { content: '饭后百步走，活到九十九。', author: '养生格言', category: '运动' },
    { content: '宁可食无肉，不可居无竹；宁可睡无枕，不可食无律。', author: '苏轼', category: '养生' },
    { content: '上医治未病，中医治欲病，下医治已病。', author: '黄帝内经', category: '中医' }
  ];

  const insertQuote = db.prepare(`
    INSERT INTO motivational_quotes (content, author, category) VALUES (?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertQuote.run(item.content, item.author, item.category);
    }
  });

  insertMany(quotes);
  console.log('已创建10条示例励志语');

  // 记录初始化日志
  logOperation(null, '系统', 'init_database', 'system', null, { message: '数据库初始化完成' });

  console.log('\n数据库初始化完成！');
  console.log('========================================');
  console.log('管理员账号: admin / admin123');
  console.log('医生账号1: 13800000001 / 123456 (王建国)');
  console.log('医生账号2: 13800000002 / 123456 (李明华)');
  console.log('护士账号: 13800000003 / 123456 (赵小燕)');
  console.log('========================================');
}

initDB().catch((err) => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});

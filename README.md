# 医院呼叫系统

## 项目概述
医院门诊患者导诊叫号管理系统，解决患者有序候诊、医生高效接诊、管理者数据可视的问题。

## 技术栈
- 后端：Node.js + Express + better-sqlite3 + WebSocket (ws)
- 前端：HTML5 + CSS3 + JavaScript（无框架依赖）
- 数据库：SQLite（单文件数据库，免安装）

## 环境要求
- Node.js >= 14.0
- npm >= 6.0
- 现代浏览器（Chrome/Edge/Firefox 最新版）

## 快速开始

### 1. 安装依赖
```bash
cd hospital-calling-system
npm install
```

### 2. 初始化数据库（首次运行）
```bash
npm run init-db
```

### 3. 启动服务
```bash
npm start
```
或双击 `start.bat` 一键启动。

启动后自动打开浏览器访问 http://localhost:3000/login.html

### 4. Windows 一键启动
双击项目根目录下的 `start.bat` 即可自动初始化数据库并启动服务。

## 测试账号

| 角色 | 账号 | 密码 | 说明 |
|------|------|------|------|
| 管理员 | admin | admin123 | 系统管理员，管理所有账号和数据 |
| 医生1 | 13800000001 | 123456 | 示例医生：王建国 |
| 医生2 | 13800000002 | 123456 | 示例医生：李明华 |
| 护士 | 13800000003 | 123456 | 示例护士：赵小燕 |

## 页面清单

| 页面 | 访问地址 | 说明 |
|------|----------|------|
| 登录页 | http://localhost:3000/login.html | 统一登录入口，根据角色自动跳转 |
| 护士后台 | http://localhost:3000/nurse.html | 患者信息录入、号码牌发放、患者列表管理 |
| 医生后台 | http://localhost:3000/doctor.html | 叫号操作、接诊时间轴、下班成绩单 |
| 管理员后台 | http://localhost:3000/admin.html | 仪表盘、账号管理、诊室管理、操作记录、工作评分 |
| 诊室显示屏 | http://localhost:3000/display.html?room_id=1 | 诊室外全屏显示屏（WebSocket实时+语音播报） |

## 功能说明

### 导诊护士
- 录入患者信息（姓名、年龄、病症、来源等）
- 自动分配全院统一编号号码牌（格式 A001，每日清零）
- 查看/编辑今日患者列表（姓名脱敏显示）
- 不可批量导出患者数据

### 医生
- 点击"下一位"叫号，显示屏实时刷新 + 语音播报
- 点击"跳过"处理过号患者
- 底部横向时间轴展示今日接诊记录
- 下班后查看当日成绩单（接诊统计 + 评分 + 励志语）

### 管理员
- 仪表盘查看所有人员业绩和上班记录
- 增删改所有账号
- 诊室管理（绑定显示屏与医生）
- 查看操作记录（患者修改、账号操作、叫号操作）
- 工作评分管理（接诊量60% + 考勤20% + 主观评价20%）

### 诊室外显示屏
- 全屏显示当前叫号号码 + 患者脱敏姓名
- 显示医生照片和简历信息
- WebSocket 实时推送，无需手动刷新
- 语音播报叫号信息（仅播报号码，不播报姓名）

## 隐私保护
- 患者姓名脱敏规则：3字及以上显示"姓*末字"（如张三丰->张*丰），2字名仅显示姓（如李明->李*）
- 语音播报不播报患者姓名
- 导诊护士录入时可查看完整信息，但列表页脱敏
- 不可批量导出或下载患者数据

## 项目结构
```
hospital-calling-system/
├── start.bat                  # Windows 一键启动脚本
├── package.json               # 项目配置和依赖
├── server/
│   ├── app.js                 # 主应用入口（端口 3000）
│   ├── database.js             # 数据库初始化和辅助函数
│   ├── init-db.js              # 初始化示例数据
│   ├── middleware.js           # JWT 认证和角色权限中间件
│   ├── websocket.js            # WebSocket 实时推送服务
│   └── routes/
│       ├── auth.js             # 登录/改密/重置密码
│       ├── nurse.js            # 护士相关接口
│       ├── doctor.js           # 医生相关接口
│       ├── admin.js            # 管理员相关接口
│       └── display.js          # 显示屏数据接口
├── public/
│   ├── login.html             # 登录页
│   ├── nurse.html             # 护士后台
│   ├── doctor.html            # 医生后台
│   ├── admin.html             # 管理员后台
│   ├── display.html           # 诊室外显示屏
│   ├── css/
│   │   └── style.css          # 全局样式
│   └── js/
│       ├── api.js             # API 请求封装
│       └── utils.js           # 工具函数
├── uploads/                    # 医生照片上传目录
└── data/                       # SQLite 数据库（自动创建）
    └── hospital.db
```

## API 接口文档

### 认证接口
| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/auth/login | 登录 | 否 |
| POST | /api/auth/change-password | 修改密码 | 是 |
| POST | /api/auth/reset-password | 重置他人密码 | 管理员 |

### 护士接口
| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/nurse/patients | 录入患者 | 护士 |
| GET | /api/nurse/patients | 今日患者列表 | 护士 |
| PUT | /api/nurse/patients/:id | 修改患者信息 | 护士 |
| GET | /api/nurse/doctors | 在岗医生列表 | 护士 |

### 医生接口
| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/doctor/today | 今日接诊概况 | 医生 |
| POST | /api/doctor/call-next | 叫下一位 | 医生 |
| POST | /api/doctor/skip | 跳过当前患者 | 医生 |
| GET | /api/doctor/timeline | 接诊时间轴 | 医生 |
| POST | /api/doctor/off-work | 下班 | 医生 |
| GET | /api/doctor/summary | 成绩单 | 医生 |

### 管理员接口
| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/admin/dashboard | 仪表盘数据 | 管理员 |
| GET | /api/admin/accounts | 账号列表 | 管理员 |
| POST | /api/admin/accounts | 创建账号 | 管理员 |
| PUT | /api/admin/accounts/:id | 编辑账号 | 管理员 |
| DELETE | /api/admin/accounts/:id | 停用账号 | 管理员 |
| GET | /api/admin/logs | 操作记录 | 管理员 |
| GET | /api/admin/rooms | 诊室列表 | 管理员 |
| POST | /api/admin/rooms | 创建诊室 | 管理员 |
| PUT | /api/admin/rooms/:id | 编辑诊室 | 管理员 |
| POST | /api/admin/scores/:account_id | 评分 | 管理员 |
| PUT | /api/admin/doctors/:id/profile | 医生简历 | 管理员 |

### 显示屏接口
| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/display/:room_id | 诊室显示屏数据 | 否 |

### WebSocket
| 路径 | 说明 |
|------|------|
| ws://host:3000/ws?room_id=X | 订阅诊室叫号推送 |

## 部署说明
- 系统设计为局域网内部部署，数据不出医院
- 所有设备（诊室电脑、导诊台、显示屏）需在同一局域网
- 显示屏需支持浏览器全屏模式，建议 42 寸以上显示器
- 服务默认监听 3000 端口，可在 app.js 中修改

## 注意事项
- 每日 00:00 所有号码牌编号自动清零
- 预约患者和现场患者混合排队，按到达顺序发号
- 医生首次登录后建议修改默认密码
- 管理员可在后台重置任意账号密码为 123456

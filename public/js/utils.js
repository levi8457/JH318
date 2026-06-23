/**
 * 医院呼叫系统 - 工具函数
 */

/**
 * 格式化时间为 HH:mm
 * @param {string} dateStr - 日期时间字符串
 * @returns {string} 格式化后的时间字符串
 */
function formatTime(dateStr) {
    if (!dateStr) return '';
    var date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    var hours = String(date.getHours()).padStart(2, '0');
    var minutes = String(date.getMinutes()).padStart(2, '0');
    return hours + ':' + minutes;
}

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {string} dateStr - 日期时间字符串
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(dateStr) {
    if (!dateStr) return '';
    var date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
}

/**
 * 格式化为 YYYY-MM-DD HH:mm
 * @param {string} dateStr - 日期时间字符串
 * @returns {string} 格式化后的日期时间字符串
 */
function formatDateTime(dateStr) {
    if (!dateStr) return '';
    return formatDate(dateStr) + ' ' + formatTime(dateStr);
}

/**
 * 姓名脱敏
 * 3字及以上：姓 + * + 最后一个字 (如: 张三丰 -> 张*丰)
 * 2字：姓 + * (如: 张三 -> 张*)
 * 1字：直接返回
 * @param {string} name - 姓名
 * @returns {string} 脱敏后的姓名
 */
function maskName(name) {
    if (!name) return '';
    var len = name.length;
    if (len <= 1) return name;
    if (len === 2) return name.charAt(0) + '*';
    // 3字及以上
    return name.charAt(0) + '*'.repeat(len - 2) + name.charAt(len - 1);
}

/**
 * 角色名映射
 * @param {string} role - 角色标识
 * @returns {string} 角色中文名称
 */
function getRoleName(role) {
    var roleMap = {
        'admin': '管理员',
        'nurse': '导诊护士',
        'doctor': '医生'
    };
    return roleMap[role] || role || '未知';
}

/**
 * 来源映射
 * @param {string} source - 来源标识
 * @returns {string} 来源中文名称
 */
function getSourceName(source) {
    var sourceMap = {
        'online': '线上预约',
        'onsite': '现场挂号',
        'transfer': '转诊',
        'referral': '医生推荐'
    };
    return sourceMap[source] || source || '未知';
}

/**
 * 页面右上角弹出通知提示
 * @param {string} message - 提示消息
 * @param {string} type - 提示类型: 'success' | 'error' | 'warning' | 'info'
 * @param {number} [duration=3000] - 显示时长(毫秒)，默认3秒
 */
function showNotification(message, type, duration) {
    type = type || 'info';
    duration = duration || 3000;

    // 确保通知容器存在
    var container = document.querySelector('.notification-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';
        document.body.appendChild(container);
    }

    // 图标映射
    var iconMap = {
        'success': '&#10004;',
        'error': '&#10006;',
        'warning': '&#9888;',
        'info': '&#8505;'
    };

    // 创建通知元素
    var notification = document.createElement('div');
    notification.className = 'notification ' + type;
    notification.innerHTML = '<span class="notification-icon">' + (iconMap[type] || '') + '</span>' +
                            '<span class="notification-message">' + message + '</span>';

    container.appendChild(notification);

    // 自动消失
    setTimeout(function() {
        notification.classList.add('removing');
        setTimeout(function() {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, duration);
}

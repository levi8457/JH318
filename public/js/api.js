/**
 * 医院呼叫系统 - API 请求封装
 */

const BASE_URL = 'http://' + window.location.host + '/api';

/**
 * 基础请求函数
 * @param {string} method - HTTP 方法 (GET, POST, PUT, DELETE)
 * @param {string} url - 请求路径 (如 /auth/login)
 * @param {object} [data] - 请求体数据
 * @returns {Promise<object>} - 响应数据
 */
function request(method, url, data) {
    const headers = {
        'Content-Type': 'application/json'
    };

    // 从 localStorage 获取 token 并添加到 Authorization header
    const token = localStorage.getItem('token');
    if (token) {
        headers['Authorization'] = 'Bearer ' + token;
    }

    const options = {
        method: method,
        headers: headers
    };

    // GET 和 DELETE 请求不发送 body
    if (data !== undefined && method !== 'GET' && method !== 'DELETE') {
        options.body = JSON.stringify(data);
    }

    return fetch(BASE_URL + url, options)
        .then(function(response) {
            // 401 未授权，自动跳转到登录页
            if (response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                // 避免在登录页重复跳转
                if (window.location.pathname.indexOf('login.html') === -1) {
                    window.location.href = '/login.html';
                }
                return Promise.reject(new Error('登录已过期，请重新登录'));
            }

            // 解析 JSON 响应
            return response.json().then(function(result) {
                if (!response.ok) {
                    // 服务器返回了错误信息
                    var errMsg = result.message || result.error || '请求失败';
                    return Promise.reject(new Error(errMsg));
                }
                return result;
            }).catch(function(err) {
                // JSON 解析失败
                if (err instanceof SyntaxError) {
                    if (!response.ok) {
                        return Promise.reject(new Error('服务器错误 (' + response.status + ')'));
                    }
                    return { success: true };
                }
                return Promise.reject(err);
            });
        })
        .catch(function(err) {
            // 网络错误
            if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
                return Promise.reject(new Error('网络连接失败，请检查网络'));
            }
            return Promise.reject(err);
        });
}

/**
 * API 对象 - 提供便捷的请求方法
 */
var api = {
    /**
     * GET 请求
     * @param {string} url - 请求路径
     * @returns {Promise<object>}
     */
    get: function(url) {
        return request('GET', url);
    },

    /**
     * POST 请求
     * @param {string} url - 请求路径
     * @param {object} [data] - 请求体数据
     * @returns {Promise<object>}
     */
    post: function(url, data) {
        return request('POST', url, data);
    },

    /**
     * PUT 请求
     * @param {string} url - 请求路径
     * @param {object} [data] - 请求体数据
     * @returns {Promise<object>}
     */
    put: function(url, data) {
        return request('PUT', url, data);
    },

    /**
     * DELETE 请求
     * @param {string} url - 请求路径
     * @returns {Promise<object>}
     */
    delete: function(url) {
        return request('DELETE', url);
    }
};

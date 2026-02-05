/**
 * Clash API 封装
 * 通过 Clash 的 RESTful API 控制节点切换
 */

const CLASH_API_URL = 'http://127.0.0.1:9097';
const CLASH_API_SECRET = 'set-your-secret';
const API_TIMEOUT = 5000;

/**
 * 调用 Clash API
 * @param {string} endpoint - API 端点
 * @param {object} options - fetch 选项
 * @returns {Promise<object>}
 */
async function callClashAPI(endpoint, options = {}) {
    const url = `${CLASH_API_URL}${endpoint}`;

    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${CLASH_API_SECRET}`,
            'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(API_TIMEOUT)
    };

    const mergedOptions = { ...defaultOptions, ...options };

    try {
        const response = await fetch(url, mergedOptions);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        if (error.name === 'TimeoutError') {
            throw new Error('API 请求超时，请检查 Clash 是否正在运行');
        }
        throw error;
    }
}

/**
 * 测试 Clash API 连接
 * @returns {Promise<boolean>}
 */
async function testClashConnection() {
    try {
        await callClashAPI('/');
        return true;
    } catch (error) {
        console.error('Clash API 连接失败:', error);
        return false;
    }
}

/**
 * 获取所有代理
 * @returns {Promise<object>}
 */
async function getProxies() {
    try {
        const data = await callClashAPI('/proxies');
        return data.proxies || {};
    } catch (error) {
        console.error('获取代理列表失败:', error);
        throw error;
    }
}

/**
 * 获取指定代理信息
 * @param {string} name - 代理名称
 * @returns {Promise<object>}
 */
async function getProxy(name) {
    try {
        const data = await callClashAPI(`/proxies/${name}`);
        return data;
    } catch (error) {
        console.error('获取代理信息失败:', error);
        throw error;
    }
}

/**
 * 自动检测主要的代理组（Selector类型）
 * @returns {Promise<string>} - 返回代理组名称
 */
async function detectMainProxyGroup() {
    try {
        const proxies = await getProxies();

        // 查找第一个 Selector 类型的代理组（排除 GLOBAL 和特殊组）
        for (const [name, proxy] of Object.entries(proxies)) {
            if (proxy.type === 'Selector' &&
                !['GLOBAL', 'DIRECT', 'REJECT'].includes(name)) {
                console.log(`✅ 检测到主代理组: ${name}`);
                return name;
            }
        }

        // 如果没找到，使用 GLOBAL
        if (proxies['GLOBAL']) {
            console.log('⚠️ 使用默认代理组: GLOBAL');
            return 'GLOBAL';
        }

        throw new Error('未找到可用的代理组');
    } catch (error) {
        console.error('检测代理组失败:', error);
        throw error;
    }
}

/**
 * 判断是否为真实节点（排除流量信息等）
 * @param {string} nodeName - 节点名称
 * @returns {boolean}
 */
function isRealNode(nodeName) {
    // 排除流量信息、套餐信息等非节点项
    const excludePatterns = [
        /剩余流量/,
        /距离下次重置/,
        /套餐到期/,
        /流量告警/,
        /过期时间/
    ];

    return !excludePatterns.some(pattern => pattern.test(nodeName));
}

/**
 * 获取代理组中的所有真实节点
 * @param {string} groupName - 代理组名称（可选，自动检测）
 * @returns {Promise<Array>}
 */
async function getProxyNodes(groupName = null) {
    try {
        // 如果没有指定组名，自动检测
        if (!groupName) {
            groupName = await detectMainProxyGroup();
        }

        const proxy = await getProxy(groupName);

        if (!proxy || !proxy.all) {
            throw new Error(`代理组 ${groupName} 不存在或没有节点`);
        }

        // 过滤出真实节点，排除流量信息等
        const realNodes = proxy.all.filter(nodeName => {
            // 排除特殊节点
            if (['DIRECT', 'REJECT'].includes(nodeName)) {
                return false;
            }
            // 排除流量信息等
            return isRealNode(nodeName);
        });

        console.log(`✅ 代理组 "${groupName}" 中找到 ${realNodes.length} 个真实节点`);

        return {
            groupName: groupName,
            nodes: realNodes,
            all: proxy.all,
            current: proxy.now
        };
    } catch (error) {
        console.error('获取代理节点失败:', error);
        throw error;
    }
}

/**
 * 切换到指定节点
 * @param {string} nodeName - 节点名称
 * @param {string} groupName - 代理组名称（可选，自动检测）
 * @returns {Promise<boolean>}
 */
async function switchNode(nodeName, groupName = null) {
    try {
        // 如果没有指定组名，自动检测
        if (!groupName) {
            groupName = await detectMainProxyGroup();
        }

        const response = await callClashAPI(`/proxies/${groupName}`, {
            method: 'PUT',
            body: JSON.stringify({ name: nodeName })
        });

        console.log(`✅ 已切换到节点: ${nodeName} (组: ${groupName})`);
        return true;
    } catch (error) {
        console.error('切换节点失败:', error);
        throw error;
    }
}

/**
 * 测试节点延迟
 * @param {string} nodeName - 节点名称
 * @param {string} testUrl - 测试 URL（可选，默认 Google）
 * @param {number} timeout - 超时时间（毫秒，默认 5000）
 * @returns {Promise<number>} - 延迟时间（毫秒），失败返回 -1
 */
async function testNodeLatency(nodeName, testUrl = 'http://www.google.com/generate_204', timeout = 5000) {
    try {
        const response = await callClashAPI(`/proxies/${nodeName}/delay`, {
            method: 'GET',
            body: JSON.stringify({
                url: testUrl,
                timeout: timeout
            })
        });

        if (response.delay !== undefined) {
            console.log(`✅ 节点 ${nodeName} 延迟: ${response.delay}ms`);
            return response.delay;
        } else {
            return -1;
        }
    } catch (error) {
        console.error(`❌ 节点 ${nodeName} 测试失败:`, error);
        return -1;
    }
}

/**
 * 测试所有节点延迟
 * @param {string} groupName - 代理组名称（可选，自动检测）
 * @returns {Promise<object>} - 返回节点延迟映射
 */
async function testAllNodes(groupName = null) {
    try {
        const { nodes, groupName: actualGroup } = await getProxyNodes(groupName);
        const results = {};

        console.log(`开始测试 ${nodes.length} 个节点...`);

        // 逐个测试（避免并发过载）
        for (let i = 0; i < nodes.length; i++) {
            const nodeName = nodes[i];

            try {
                const latency = await testNodeLatency(nodeName);
                results[nodeName] = latency;

                // 发送进度
                if (typeof self !== 'undefined' && self.clients) {
                    self.clients.forEach(client => {
                        client.postMessage({
                            action: 'testProgress',
                            current: i + 1,
                            total: nodes.length,
                            nodeName: nodeName,
                            latency: latency
                        });
                    });
                }
            } catch (error) {
                console.error(`测试节点 ${nodeName} 失败:`, error);
                results[nodeName] = -1;
            }

            // 稍微延迟，避免请求过快
            if (i < nodes.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        console.log(`✅ 测试完成，共 ${nodes.length} 个节点`);
        return results;
    } catch (error) {
        console.error('测试所有节点失败:', error);
        throw error;
    }
}

/**
 * 获取当前使用的节点
 * @param {string} groupName - 代理组名称（可选，自动检测）
 * @returns {Promise<string>}
 */
async function getCurrentNode(groupName = null) {
    try {
        // 如果没有指定组名，自动检测
        if (!groupName) {
            groupName = await detectMainProxyGroup();
        }

        const proxy = await getProxy(groupName);
        return proxy.now || '';
    } catch (error) {
        console.error('获取当前节点失败:', error);
        return '';
    }
}

/**
 * 获取 Clash 配置
 * @returns {Promise<object>}
 */
async function getConfig() {
    try {
        return await callClashAPI('/configs');
    } catch (error) {
        console.error('获取配置失败:', error);
        throw error;
    }
}

/**
 * 获取 Clash 规则
 * @returns {Promise<object>}
 */
async function getRules() {
    try {
        const data = await callClashAPI('/rules');
        return data;
    } catch (error) {
        console.error('获取规则失败:', error);
        throw error;
    }
}

/**
 * 获取完整的节点信息（包括类型、状态等）
 * @returns {Promise<Array>}
 */
async function getDetailedNodes() {
    try {
        const { groupName, nodes, current } = await getProxyNodes();
        const proxies = await getProxies();

        const detailedNodes = nodes.map(nodeName => {
            const proxy = proxies[nodeName];
            return {
                name: nodeName,
                type: proxy?.type || 'unknown',
                alive: proxy?.alive || false,
                history: proxy?.history || [],
                latency: proxy?.history?.[0]?.delay || null,
                current: nodeName === current
            };
        });

        return {
            groupName: groupName,
            current: current,
            nodes: detailedNodes
        };
    } catch (error) {
        console.error('获取详细节点信息失败:', error);
        throw error;
    }
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        testClashConnection,
        getProxies,
        getProxy,
        detectMainProxyGroup,
        getProxyNodes,
        switchNode,
        testNodeLatency,
        testAllNodes,
        getCurrentNode,
        getConfig,
        getRules,
        getDetailedNodes,
        isRealNode
    };
}

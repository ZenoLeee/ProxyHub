// ProxyHub Background - 使用 GLOBAL 组切换
console.log('ProxyHub started');

// 默认 API 地址（会被设置覆盖）
let API_BASE = 'http://127.0.0.1:9999';
let API_SECRET = 'set-your-secret';
let TEST_URL = 'http://www.gstatic.com/generate_204'; // 默认测速目标地址
let SUBSCRIPTIONS = [];

// 带超时的 fetch 包装函数
async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`请求超时 (${timeout}ms)`);
    }
    throw error;
  }
}

// 自动切换定时器
let autoSwitchTimer = null;

// 流量信息更新定时器
let trafficUpdateTimer = null;

// 智能连接关键词
let SMART_CONNECT_KEYWORDS = '';

// 初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  clearTestState().then(() => loadSettings().then(() => init()));
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started');
  clearTestState().then(() => loadSettings().then(() => init()));
});

// 清除测试状态（防止重新加载后状态残留）
async function clearTestState() {
  try {
    await chrome.storage.local.set({
      isTesting: false,
      testProgress: null
    });
  } catch (error) {
    console.error('清除测试状态失败:', error);
  }
}

// 加载设置
async function loadSettings() {
  try {
    // 从 local 加载所有设置
    const localResult = await chrome.storage.local.get(['settings', 'subscriptions']);

    const settings = localResult.settings || {};
    const subscriptions = localResult.subscriptions || [];

    if (settings) {
      if (settings.apiUrl) API_BASE = settings.apiUrl;
      if (settings.apiSecret) API_SECRET = settings.apiSecret;
      if (settings.smartConnectKeywords) SMART_CONNECT_KEYWORDS = settings.smartConnectKeywords;
      if (settings.testUrl) TEST_URL = settings.testUrl;  // 测速目标地址

      // 加载订阅列表
      SUBSCRIPTIONS = subscriptions;

      // 启动或停止智能连接定时器
      if (settings.smartConnect) {
        startAutoSwitch();
      } else {
        stopAutoSwitch();
      }

      // 启动流量信息更新定时器
      startTrafficUpdate();
    }
  } catch (error) {
    console.error('Load settings failed:', error);
  }
}

// 重新加载订阅列表
async function reloadSubscriptions() {
  try {
    const result = await chrome.storage.local.get(['subscriptions']);
    SUBSCRIPTIONS = result.subscriptions || [];

    if (SUBSCRIPTIONS.length === 0) {
      console.log('⚠️ 订阅列表为空');
    } else {
      console.log(`✓ 订阅列表已重新加载: ${SUBSCRIPTIONS.length} 个订阅`);
    }
  } catch (error) {
    console.error('重新加载订阅失败:', error);
  }
}

async function init() {
  try {
    // 如果 API 地址还是默认值，说明用户还没配置，跳过连接
    if (API_BASE === 'http://127.0.0.1:9999' && API_SECRET === 'set-your-secret') {
      console.log('API not configured yet, skipping init');
      await chrome.storage.local.set({
        connectionError: '请先在设置中配置 Clash API 地址和密钥',
        nodes: [],
        currentNode: ''
      });
      return;
    }

    // 连接 Clash API（通过代理）
    const response = await fetchWithTimeout(`${API_BASE}/`, {
      headers: { 'Authorization': `Bearer ${API_SECRET}` }
    }, 5000);

    if (!response.ok) {
      throw new Error('API连接失败');
    }

    // 清除错误状态
    await chrome.storage.local.set({ connectionError: null });

    // 切换到 Rule 模式
    await fetchWithTimeout(`${API_BASE}/configs`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${API_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ mode: 'Rule' })
    }, 5000);

    // 获取代理列表
    const proxiesResponse = await fetchWithTimeout(`${API_BASE}/proxies`, {
      headers: { 'Authorization': `Bearer ${API_SECRET}` }
    }, 5000);
    const proxiesData = await proxiesResponse.json();

    // 获取 GLOBAL 组
    const globalGroup = proxiesData.proxies['GLOBAL'];
    if (!globalGroup) {
      throw new Error('GLOBAL group not found');
    }

    // 过滤出实际的代理节点（不包括组节点和信息节点）
    const excludePatterns = [
      /剩余流量/, /距离下次重置/, /套餐到期/,
      /^DIRECT$/, /^REJECT$/, /^GLOBAL$/,
    ];

    // 排除的代理组类型
    const excludeTypes = ['Selector', 'URLTest', 'Fallback', 'Relay', 'Direct', 'Reject', 'Compatible', 'DIRECT'];

    const options = globalGroup.all.filter(opt => {
      // 排除匹配的节点
      if (excludePatterns.some(p => p.test(opt))) return false;

      // 检查是否是实际的代理节点
      const proxy = proxiesData.proxies[opt];
      if (!proxy) return false;

      // 排除代理组类型，显示所有实际的代理节点
      return !excludeTypes.includes(proxy.type);
    });

    const nodes = options.map(name => {
      const proxy = proxiesData.proxies[name];
      return {
        name: name,
        type: proxy?.type || 'unknown',
        alive: proxy?.alive !== false,
        latency: proxy?.history?.[0]?.delay || null,
        current: name === globalGroup.now
      };
    });

    await chrome.storage.local.set({
      nodes: nodes,
      proxyGroup: 'GLOBAL',
      currentNode: globalGroup.now
    });

    // 注意：不需要在这里调用 getTrafficInfo()
    // 因为 loadSettings() 中的 startTrafficUpdate() 已经会立即执行一次
  } catch (error) {
    console.error('Init failed:', error);

    // 保存友好的错误信息
    const errorMsg = error.message.includes('Failed to fetch')
      ? '无法连接到 Clash API，请检查设置中的 API 地址和端口'
      : error.message.includes('API连接失败')
      ? 'API 连接失败，请检查 Clash 是否正在运行'
      : '连接出错: ' + error.message;

    await chrome.storage.local.set({
      connectionError: errorMsg,
      nodes: [],
      currentNode: ''
    });
  }
}

// 消息监听
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === 'getNodes') {
    chrome.storage.local.get(['nodes', 'proxyGroup', 'currentNode'], (result) => {
      sendResponse({
        success: true,
        nodes: result.nodes || [],
        proxyGroup: result.proxyGroup || 'GLOBAL',
        currentNode: result.currentNode || ''
      });
    });
    return true;
  }

  if (request.action === 'updateNodes') {
    init().then(() => {
      chrome.storage.local.get(['nodes', 'proxyGroup'], (result) => {
        sendResponse({
          success: true,
          nodes: result.nodes || [],
          proxyGroup: result.proxyGroup || 'GLOBAL',
          message: `Updated ${result.nodes?.length || 0} nodes`
        });
      });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'connect') {
    const { node } = request;

    // 切换 GLOBAL 组到指定节点
    fetchWithTimeout(`${API_BASE}/proxies/GLOBAL`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${API_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: node.name })
    }, 5000)
    .then(async response => {
      if (response.ok) {
        await chrome.storage.local.set({ currentNode: node.name });
        sendResponse({ success: true, message: `Connected: ${node.name}` });
      } else {
        const text = await response.text();
        console.error(`切换失败 (${response.status}): ${text}`);
        sendResponse({ success: false, error: `切换失败 (${response.status})` });
      }
    })
    .catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'disconnect') {
    // 切换到 DIRECT
    fetchWithTimeout(`${API_BASE}/proxies/GLOBAL`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${API_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'DIRECT' })
    }, 5000)
    .then(async response => {
      if (response.ok) {
        await chrome.storage.local.set({ currentNode: '' });
        sendResponse({ success: true, message: 'Disconnected' });
      } else {
        sendResponse({ success: false, error: 'Disconnect failed' });
      }
    })
    .catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'testDelay') {
    const { nodeName } = request;

    // Clash API 测试延迟
    const testUrl = `${API_BASE}/proxies/${encodeURIComponent(nodeName)}/delay?timeout=5000&url=${encodeURIComponent(TEST_URL)}`;

    fetchWithTimeout(testUrl, {
      headers: { 'Authorization': `Bearer ${API_SECRET}` }
    }, 10000)  // 测试延迟给10秒超时
    .then(async response => {
      if (response.ok) {
        const data = await response.json();
        sendResponse({
          success: true,
          delay: data.delay
        });
      } else {
        sendResponse({
          success: false,
          error: 'Test failed'
        });
      }
    })
    .catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'reloadNodes') {
    // 重新获取节点列表（不更新订阅）
    init().then(() => {
      chrome.storage.local.get(['nodes', 'proxyGroup', 'currentNode'], (result) => {
        sendResponse({
          success: true,
          nodes: result.nodes || [],
          proxyGroup: result.proxyGroup || 'GLOBAL',
          currentNode: result.currentNode || '',
          message: `已重新加载 ${result.nodes?.length || 0} 个节点`
        });
      });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'testAllDelays') {
    chrome.storage.local.get(['nodes', 'isTesting'], async (result) => {
      try {
        // 如果已经在测试中，返回当前状态
        if (result.isTesting) {
          sendResponse({
            success: false,
            error: '测试正在进行中',
            isTesting: true
          });
          return;
        }

        // 先从 API 获取最新的节点列表
        const proxiesResponse = await fetchWithTimeout(`${API_BASE}/proxies`, {
          headers: { 'Authorization': `Bearer ${API_SECRET}` }
        }, 5000);
        const proxiesData = await proxiesResponse.json();

        // 获取 GLOBAL 组
        const globalGroup = proxiesData.proxies['GLOBAL'];
        if (!globalGroup) {
          throw new Error('GLOBAL group not found');
        }

        // 过滤出实际的代理节点
        const excludePatterns = [
          /剩余流量/, /距离下次重置/, /套餐到期/,
          /^DIRECT$/, /^REJECT$/, /^GLOBAL$/,
        ];
        const excludeTypes = ['Selector', 'URLTest', 'Fallback', 'Relay', 'Direct', 'Reject', 'Compatible', 'DIRECT'];

        const options = globalGroup.all.filter(opt => {
          if (excludePatterns.some(p => p.test(opt))) return false;
          const proxy = proxiesData.proxies[opt];
          if (!proxy) return false;
          return !excludeTypes.includes(proxy.type);
        });

        // 构建最新的节点列表
        const nodes = options.map(name => {
          const proxy = proxiesData.proxies[name];
          return {
            name: name,
            type: proxy?.type || 'unknown',
            alive: proxy?.alive !== false,
            latency: proxy?.history?.[0]?.delay || null
          };
        });

        // 标记为测试中
        await chrome.storage.local.set({
          isTesting: true,
          testTotal: nodes.length,
          nodes: nodes  // 更新最新的节点列表
        });

        // 从设置中读取并发数量
        const localResult = await chrome.storage.local.get(['settings']);
        const settings = localResult.settings || {};
        const CONCURRENT = settings.testConcurrency || 10;
        const TIMEOUT = 10000; // 固定10秒超时

        let completed = 0;
        let index = 0;

        // 并发测试函数
        const testBatch = async (batch) => {
          const promises = batch.map(async (node) => {
            try {
              // 添加超时机制
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

              const testUrl = `${API_BASE}/proxies/${encodeURIComponent(node.name)}/delay?timeout=${TIMEOUT/2}&url=${encodeURIComponent(TEST_URL)}`;

              const response = await fetch(testUrl, {
                headers: { 'Authorization': `Bearer ${API_SECRET}` },
                signal: controller.signal
              });

              clearTimeout(timeoutId);

              if (response.ok) {
                const data = await response.json();
                return {
                  name: node.name,
                  delay: data.delay
                };
              } else {
                return {
                  name: node.name,
                  delay: -1
                };
              }
            } catch (error) {
              console.error(`测试节点 ${node.name} 失败:`, error.message);
              return {
                name: node.name,
                delay: -1
              };
            }
          });

          const batchResults = await Promise.all(promises);
          return batchResults;
        };

        // 分批测试
        try {
          while (index < nodes.length) {
            const batch = nodes.slice(index, index + CONCURRENT);

            const batchResults = await testBatch(batch);

            results.push(...batchResults);
            index += batch.length;
            completed = results.length;

            // 更新进度
            await chrome.storage.local.set({
              testProgress: {
                completed: completed,
                total: nodes.length,
                current: results
              }
            });
          }
        } catch (error) {
          console.error('批量测试出错:', error);
          // 即使出错也要继续，标记剩余节点为失败
          while (index < nodes.length) {
            results.push({
              name: nodes[index].name,
              delay: -1
            });
            index++;
          }
        }

        // 按延迟排序
        results.sort((a, b) => a.delay - b.delay);

        // 更新 storage 中的节点延迟数据
        const delayMap = {};
        results.forEach(r => {
          delayMap[r.name] = r.delay;
        });

        const updatedNodes = nodes.map(node => ({
          ...node,
          latency: delayMap[node.name] !== undefined ? delayMap[node.name] : -1
        }));

        await chrome.storage.local.set({ nodes: updatedNodes });

        sendResponse({
          success: true,
          results: results
        });
      } catch (error) {
        console.error('测试延迟出错:', error);

        // 保存友好的错误信息
        const errorMsg = error.message.includes('Failed to fetch')
          ? '无法连接到 Clash API，请检查设置中的 API 地址和端口'
          : '测试延迟出错: ' + error.message;

        await chrome.storage.local.set({ connectionError: errorMsg });

        sendResponse({
          success: false,
          error: errorMsg
        });
      } finally {
        // 确保总是清除测试状态
        try {
          await chrome.storage.local.set({
            isTesting: false,
            testProgress: null
          });
        } catch (e) {
          console.error('清除测试状态失败:', e);
        }
      }
    });

    return true;
  }

  if (request.action === 'getTestProgress') {
    chrome.storage.local.get(['isTesting', 'testProgress', 'testTotal'], (result) => {
      sendResponse({
        success: true,
        isTesting: result.isTesting || false,
        progress: result.testProgress || null,
        total: result.testTotal || 0
      });
    });
    return true;
  }

  if (request.action === 'updateSettings') {
    // 重新加载设置并初始化
    loadSettings().then(() => {
      return init();
    }).then(() => {
      sendResponse({ success: true, message: '设置已更新，已重新连接' });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'reloadSubscriptions') {
    // 重新加载订阅列表
    chrome.storage.local.get(['subscriptions'], (result) => {
      SUBSCRIPTIONS = result.subscriptions || [];
      sendResponse({
        success: true,
        subscriptions: SUBSCRIPTIONS
      });
    });
    return true;
  }

  if (request.action === 'triggerSmartConnect') {
    // 立即触发智能连接
    smartSwitchToBest().then(() => {
      sendResponse({ success: true, message: '智能连接已触发' });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'updateTrafficInfo') {
    // 重新加载订阅列表，然后触发流量信息更新
    reloadSubscriptions().then(() => {
      if (SUBSCRIPTIONS.length === 0) {
        sendResponse({ success: false, error: '订阅列表为空' });
        return;
      }
      return getTrafficInfo();
    }).then(() => {
      sendResponse({ success: true, message: '流量信息已更新' });
    }).catch(error => {
      console.error('更新流量信息失败:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'switchMode') {
    // 切换模式（带超时保护）
    const { mode } = request;

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), 5000)
    );

    const fetchPromise = fetch(`${API_BASE}/configs`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${API_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ mode: mode })
    })
    .then(async response => {
      if (response.ok) {
        return { success: true, message: `已切换到${mode}模式` };
      } else {
        return { success: false, error: '切换模式失败' };
      }
    })
    .catch(error => {
      return { success: false, error: error.message };
    });

    Promise.race([fetchPromise, timeoutPromise])
      .then(result => sendResponse(result))
      .catch(() => sendResponse({ success: false, error: '请求超时' }));

    return true;
  }

  if (request.action === 'getCurrentMode') {
    // 获取当前模式（带超时保护）
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), 5000)
    );

    const fetchPromise = fetch(`${API_BASE}/configs`, {
      headers: { 'Authorization': `Bearer ${API_SECRET}` }
    })
    .then(async response => {
      if (response.ok) {
        const config = await response.json();
        return { success: true, mode: config.mode };
      } else {
        return { success: false, error: '获取模式失败' };
      }
    })
    .catch(error => {
      return { success: false, error: error.message };
    });

    Promise.race([fetchPromise, timeoutPromise])
      .then(result => sendResponse(result))
      .catch(() => sendResponse({ success: false, error: '请求超时' }));

    return true;
  }

  sendResponse({ success: false, error: 'Unknown action' });
});

console.log('ProxyHub ready');

// ==================== 自动切换功能 ====================

// 启动自动切换定时器
function startAutoSwitch() {
  // 先清除旧的定时器
  stopAutoSwitch();

  // 立即执行一次
  smartSwitchToBest();

  // 每5分钟执行一次（300000毫秒）
  autoSwitchTimer = setInterval(() => {
    smartSwitchToBest();
  }, 300000);
}

// 停止自动切换定时器
function stopAutoSwitch() {
  if (autoSwitchTimer) {
    clearInterval(autoSwitchTimer);
    autoSwitchTimer = null;
  }
}

// 智能切换到最优节点
async function smartSwitchToBest() {
  try {

    // 获取节点列表
    const nodesResponse = await fetchWithTimeout(`${API_BASE}/proxies`, {
      headers: { 'Authorization': `Bearer ${API_SECRET}` }
    }, 5000);

    if (!nodesResponse.ok) {
      throw new Error('获取节点列表失败');
    }

    const proxiesData = await nodesResponse.json();
    const globalGroup = proxiesData.proxies['GLOBAL'];
    const allProxies = proxiesData.proxies; // 保存所有代理信息，用于后续保存延迟数据

    if (!globalGroup) {
      throw new Error('GLOBAL 组不存在');
    }

    // 过滤出实际的代理节点
    const excludePatterns = [
      /剩余流量/, /距离下次重置/, /套餐到期/,
      /^DIRECT$/, /^REJECT$/, /^GLOBAL$/,
    ];
    const excludeTypes = ['Selector', 'URLTest', 'Fallback', 'Relay', 'Direct', 'Reject', 'Compatible', 'DIRECT'];

    const options = globalGroup.all.filter(opt => {
      if (excludePatterns.some(p => p.test(opt))) return false;
      const proxy = proxiesData.proxies[opt];
      if (!proxy) return false;
      return !excludeTypes.includes(proxy.type);
    });

    // 根据关键词过滤节点
    let filteredOptions = options;
    if (SMART_CONNECT_KEYWORDS) {
      const keywords = SMART_CONNECT_KEYWORDS.split(',').map(k => k.trim()).filter(k => k);
      filteredOptions = options.filter(opt => {
        const nodeNameLower = opt.toLowerCase();
        return keywords.some(keyword => nodeNameLower.includes(keyword.toLowerCase()));
      });
    }

    if (filteredOptions.length === 0) {
      return;
    }

    // 从设置中读取并发数量
    const localResult = await chrome.storage.local.get(['settings']);
    const settings = localResult.settings || {};
    const CONCURRENT = settings.testConcurrency || 10;
    const TIMEOUT = 10000; // 固定10秒超时

    const results = [];

    for (let i = 0; i < filteredOptions.length; i += CONCURRENT) {
      const batch = filteredOptions.slice(i, i + CONCURRENT);
      const batchResults = await Promise.all(batch.map(async (nodeName) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

          const testUrl = `${API_BASE}/proxies/${encodeURIComponent(nodeName)}/delay?timeout=${TIMEOUT/2}&url=${encodeURIComponent(TEST_URL)}`;

          const response = await fetch(testUrl, {
            headers: { 'Authorization': `Bearer ${API_SECRET}` },
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            return { name: nodeName, delay: data.delay };
          } else {
            return { name: nodeName, delay: -1 };
          }
        } catch (error) {
          return { name: nodeName, delay: -1 };
        }
      }));

      results.push(...batchResults);
    }

    // 找出延迟最低的有效节点
    const validResults = results.filter(r => r.delay > 0);

    if (validResults.length === 0) {
      return;
    }

    validResults.sort((a, b) => a.delay - b.delay);
    const bestNode = validResults[0];

    // 保存延迟数据到 storage，让 popup 能显示
    try {
      const storedNodes = await chrome.storage.local.get(['nodes']);
      const nodes = storedNodes.nodes || [];

      // 更新或添加节点的延迟数据
      const delayMap = {};
      results.forEach(r => {
        delayMap[r.name] = r.delay;
      });

      const updatedNodes = nodes.map(node => ({
        ...node,
        latency: delayMap[node.name] !== undefined ? delayMap[node.name] : node.latency
      }));

      // 添加新测试的节点
      results.forEach(r => {
        if (!updatedNodes.find(n => n.name === r.name)) {
          const proxy = allProxies[r.name];
          updatedNodes.push({
            name: r.name,
            type: proxy?.type || 'unknown',
            latency: r.delay
          });
        }
      });

      await chrome.storage.local.set({ nodes: updatedNodes });
    } catch (error) {
      console.error('保存延迟数据失败:', error);
    }

    // 如果当前已经连接到最优节点，不需要切换
    if (globalGroup.now === bestNode.name) {
      return;
    }

    // 切换到最优节点
    const switchResponse = await fetchWithTimeout(`${API_BASE}/proxies/GLOBAL`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${API_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: bestNode.name })
    }, 5000);

    if (switchResponse.ok) {
      await chrome.storage.local.set({ currentNode: bestNode.name });
    }
  } catch (error) {
    console.error('自动切换失败:', error.message);
  }
}

// ==================== 流量信息 ====================

// 启动流量信息更新定时器
let isTrafficUpdating = false; // 防止重复执行

function startTrafficUpdate() {
  // 先清除旧的定时器
  stopTrafficUpdate();

  // 立即执行一次（如果正在执行则跳过）
  if (!isTrafficUpdating) {
    getTrafficInfo();
  }

  // 每5分钟更新一次（300000毫秒）- 流量信息不需要频繁更新
  trafficUpdateTimer = setInterval(() => {
    if (!isTrafficUpdating) {
      getTrafficInfo();
    }
  }, 300000);
}

// 停止流量信息更新定时器
function stopTrafficUpdate() {
  if (trafficUpdateTimer) {
    clearInterval(trafficUpdateTimer);
    trafficUpdateTimer = null;
  }
}

// 获取流量余额信息
async function getTrafficInfo() {
  // 防止重复执行
  if (isTrafficUpdating) {
    return;
  }

  isTrafficUpdating = true;

  try {
    if (SUBSCRIPTIONS.length === 0) {
      await chrome.storage.local.set({ trafficInfo: null });
      return;
    }

    // 获取所有订阅的流量信息
    const trafficResults = await Promise.allSettled(
      SUBSCRIPTIONS.map(async (sub) => {
        let healthStatus = null; // 健康状态
        let statusCode = null;

        try {

          // 先使用 HEAD 请求检查健康度（快速，不下载内容）
          const connector = sub.url.includes('?') ? '&' : '?';
          const testUrl = `${sub.url}${connector}flag=clash`;

          const headers = {
            'User-Agent': 'clash-verge/1.3.8',
            'Accept': 'application/vnd.clash.config'
          };

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

          // 先尝试 HEAD 请求
          let subResponse = await fetch(testUrl, {
            method: 'HEAD',
            cache: 'no-cache',
            headers: headers,
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          statusCode = subResponse.status;

          // 根据状态码判断健康度
          if (statusCode === 200) {
            healthStatus = 'healthy'; // 绿色
          } else if (statusCode === 401 || statusCode === 403) {
            healthStatus = 'expired'; // 橙色
          } else if (statusCode === 404) {
            healthStatus = 'down'; // 红色
          }

          // 如果 HEAD 请求成功，再尝试 GET 请求获取流量信息
          if (subResponse.ok) {
            const controller2 = new AbortController();
            const timeoutId2 = setTimeout(() => controller2.abort(), 15000); // 15秒超时

            subResponse = await fetch(testUrl, {
              method: 'GET',
              cache: 'no-cache',
              headers: headers,
              signal: controller2.signal
            });

            clearTimeout(timeoutId2);
          }

          // 不区分大小写获取流量头
          const userInfo = subResponse.headers.get('Subscription-Userinfo') ||
                           subResponse.headers.get('subscription-userinfo');

          if (userInfo) {
              // 解析格式: upload=0; download=0; total=107374182400; expire=1700000000
              const parts = userInfo.split('; ');
              const info = {};
              parts.forEach(part => {
                const [key, value] = part.split('=');
                info[key] = parseInt(value);
              });

              const uploadBytes = info.upload || 0;
              const downloadBytes = info.download || 0;
              const totalBytes = info.total || 0;
              const usedBytes = uploadBytes + downloadBytes;
              const remainingBytes = totalBytes - usedBytes;

              // 检测无限流量（totalBytes >= 5TB 视为无限流量）
              const isInfinite = totalBytes >= 5497558138880; // 5 TB

              // 转换为 GB
              const uploadGB = (uploadBytes / (1024 * 1024 * 1024)).toFixed(2);
              const downloadGB = (downloadBytes / (1024 * 1024 * 1024)).toFixed(2);
              const usedGB = (usedBytes / (1024 * 1024 * 1024)).toFixed(2);
              const totalGB = isInfinite ? '∞' : (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
              const remainingGB = isInfinite ? '∞' : (remainingBytes / (1024 * 1024 * 1024)).toFixed(2);

              // 计算剩余百分比（无限流量显示为 --）
              const remainingPercent = isInfinite ? '--' : (totalBytes > 0 ? ((remainingBytes / totalBytes) * 100).toFixed(1) : 0);

              // 到期时间
              let expireText = '';
              if (info.expire) {
                const expireDate = new Date(info.expire * 1000);
                const now = new Date();
                const daysLeft = Math.ceil((expireDate - now) / (1000 * 60 * 60 * 24));
                expireText = daysLeft > 0 ? `${daysLeft}天后` : '已过期';
              }

              return {
                name: sub.name,
                url: sub.url,
                traffic: {
                  upload: `${uploadGB} GB`,
                  download: `${downloadGB} GB`,
                  used: `${usedGB} GB`,
                  total: isInfinite ? '∞ GB' : `${totalGB} GB`,
                  remaining: isInfinite ? '∞ GB' : `${remainingGB} GB (${remainingPercent}%)`,
                  expire: expireText || null,
                  isInfinite: isInfinite,
                  raw: {
                    upload: uploadBytes,
                    download: downloadBytes,
                    total: totalBytes,
                    remaining: remainingBytes
                  }
                },
                healthStatus: healthStatus
              };
            }
            return {
              name: sub.name,
              url: sub.url,
              healthStatus: healthStatus
            };
        } catch (error) {
          console.log(`订阅 ${sub.name} 获取失败:`, error.message);
          return {
            name: sub.name,
            url: sub.url,
            healthStatus: 'error' // 请求失败
          };
        }
      })
    );

    // 更新每个订阅的流量信息到 storage
    const updatedSubscriptions = SUBSCRIPTIONS.map((sub, index) => {
      const result = trafficResults[index];
      if (result.status === 'fulfilled' && result.value && result.value.traffic) {
        // 有流量信息
        return {
          ...sub,
          traffic: result.value.traffic,
          healthStatus: result.value.healthStatus,
          trafficError: false
        };
      } else if (result.status === 'fulfilled' && result.value) {
        // 响应成功但没有流量信息（如 Subscription-Userinfo 为 null）
        return {
          ...sub,
          healthStatus: result.value.healthStatus,
          trafficError: true,
          traffic: undefined
        };
      } else {
        // 请求失败
        return {
          ...sub,
          trafficError: true,
          healthStatus: result.reason?.healthStatus || 'error',
          traffic: undefined
        };
      }
    });

    await chrome.storage.local.set({ subscriptions: updatedSubscriptions });

    // 汇总所有订阅的流量信息
    let totalUpload = 0;
    let totalDownload = 0;
    let totalUsed = 0;
    let totalTotal = 0;
    let minExpire = null;
    let hasInfinite = false; // 是否有无限流量订阅

    let validCount = 0;
    trafficResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value && result.value.traffic) {
        const raw = result.value.traffic.raw;
        if (raw) {
          totalUpload += raw.upload;
          totalDownload += raw.download;
          totalUsed += (raw.upload + raw.download);
          totalTotal += raw.total;

          // 检查是否有无限流量订阅
          if (result.value.traffic.isInfinite) {
            hasInfinite = true;
          }

          if (result.value.traffic.expire) {
            const expireMatch = result.value.traffic.expire.match(/(\d+)天后/);
            if (expireMatch) {
              const days = parseInt(expireMatch[1]);
              if (minExpire === null || days < minExpire) {
                minExpire = days;
              }
            }
          }
        }

        validCount++;
      }
    });

    if (validCount > 0) {
      // 转换汇总数据为 GB
      const uploadGB = (totalUpload / (1024 * 1024 * 1024)).toFixed(2);
      const downloadGB = (totalDownload / (1024 * 1024 * 1024)).toFixed(2);
      const usedGB = (totalUsed / (1024 * 1024 * 1024)).toFixed(2);

      // 如果有无限流量订阅，显示为无限流量
      const totalGB = hasInfinite ? '∞' : (totalTotal / (1024 * 1024 * 1024)).toFixed(2);
      const remainingGB = hasInfinite ? '∞' : ((totalTotal - totalUsed) / (1024 * 1024 * 1024)).toFixed(2);
      const remainingPercent = hasInfinite ? '--' : (totalTotal > 0 ? (((totalTotal - totalUsed) / totalTotal) * 100).toFixed(1) : 0);

      const expireText = minExpire !== null ? `${minExpire}天后` : null;

      const trafficInfo = {
        upload: `${uploadGB} GB`,
        download: `${downloadGB} GB`,
        used: `${usedGB} GB`,
        total: hasInfinite ? '∞ GB' : `${totalGB} GB`,
        remaining: hasInfinite ? '∞ GB' : `${remainingGB} GB (${remainingPercent}%)`,
        expire: expireText,
        count: validCount // 订阅数量
      };

      await chrome.storage.local.set({ trafficInfo, trafficError: null });
    } else {
      // 检查是否有订阅但都失败了
      if (SUBSCRIPTIONS.length > 0) {
        await chrome.storage.local.set({
          trafficInfo: null,
          trafficError: 'CORS限制'
        });
      } else {
        await chrome.storage.local.set({
          trafficInfo: null,
          trafficError: null
        });
      }
    }
  } catch (error) {
    console.error('获取流量信息失败:', error);
    await chrome.storage.local.set({
      trafficInfo: null,
      trafficError: error.message
    });
  } finally {
    // 无论成功或失败，都清除执行标志
    isTrafficUpdating = false;
  }
}

console.log('ProxyHub ready');


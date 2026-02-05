// ProxyHub Popup - 改进版
console.log('Popup loaded');

let nodes = [];
let settings = {
  showNodeType: false,
  dualColumn: false,
  autoDelete: false,
  autoSort: false,
  darkMode: false,
  smartConnect: false  // 智能连接（定期自动切换）
};
let currentLang = 'zh_CN';
let currentTranslations = {};  // 存储当前翻译

// 加载语言文件
async function loadLocaleMessages(lang) {
  try {
    const response = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
    const data = await response.json();
    const messages = {};
    for (const key in data) {
      messages[key] = data[key].message;
    }
    return messages;
  } catch (error) {
    console.error('Failed to load locale:', error);
    return null;
  }
}

// 应用翻译到 popup 界面
async function applyTranslations(lang) {
  const messages = await loadLocaleMessages(lang);
  if (!messages) {
    console.error('Failed to load translations for:', lang);
    return;
  }

  // 存储当前翻译供后续使用
  currentTranslations = messages;

  // 查找所有带 data-i18n 属性的元素
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (messages[key]) {
      el.textContent = messages[key];
    }
  });

  // 查找所有带 data-i18n-placeholder 属性的输入框
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (messages[key]) {
      el.placeholder = messages[key];
    }
  });

  // 特殊处理：mode select 的选项
  document.querySelectorAll('#modeSelect option').forEach(option => {
    const key = option.getAttribute('data-i18n');
    if (key && messages[key]) {
      option.textContent = messages[key];
    }
  });

  currentLang = lang;
}

// 节点类型中文翻译
const typeTranslation = {
  'Shadowsocks': 'SS',
  'ShadowsocksR': 'SSR',
  'Vless': 'Vless',
  'VLESS': 'Vless',
  'Vmess': 'Vmess',
  'VMESS': 'Vmess',
  'Trojan': 'Trojan',
  'TROJAN': 'Trojan',
  'Snell': 'Snell',
  'Socks5': 'Socks5',
  'SOCKS5': 'Socks5',
  'Http': 'HTTP',
  'HTTP': 'HTTP',
  'Https': 'HTTPS',
  'HTTPS': 'HTTPS',
  'Relay': '中继',
  'Selector': '选择器',
  'URLTest': 'URL测试',
  'Fallback': '后备',
  'Direct': '直连',
  'DIRECT': '直连',
  'Reject': '拒绝',
  'REJECT': '拒绝',
  'Unknown': '未知',
  'unknown': '未知'
};

// 翻译节点类型
function translateNodeType(type) {
  return typeTranslation[type] || typeTranslation[type.toUpperCase()] || type;
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM ready');

  // 立即设置事件监听器（确保按钮可点击）
  setupEventListeners();

  // 加载语言设置并应用翻译
  const langResult = await chrome.storage.local.get(['language']);
  const savedLang = langResult.language || 'zh_CN';
  await applyTranslations(savedLang);

  await loadSettings();
  await loadNodes();

  // 加载当前模式
  await loadCurrentMode();

  // 加载流量信息
  await loadTrafficInfo();

  updateStatus();

  // 检查连接错误
  checkConnectionError();

  // 检查是否有正在进行的测试
  checkTestProgress();

  // 监听设置变化
  chrome.storage.onChanged.addListener((changes, area) => {
    // 监听 sync 和 local 两个区域的变化
    const settingsChanged = (area === 'sync' && changes.syncSettings) ||
                           (area === 'local' && (changes.settings || changes.localSettings));

    if (settingsChanged) {
      loadSettings().then(() => {
        renderNodes();
      });
    }

    if (area === 'local') {
      // 监听流量信息变化
      if (changes.trafficInfo) {
        loadTrafficInfo();
      }
      // 监听当前节点变化（智能连接切换时）
      if (changes.currentNode) {
        console.log('当前节点已变化:', changes.currentNode.newValue);
        updateStatus();
        renderNodes();
      }
      // 监听节点列表变化（延迟测试更新时）
      if (changes.nodes) {
        nodes = changes.nodes.newValue || [];
        renderNodes();
      }
    }
  });
});

async function loadSettings() {
  try {
    // 从 sync 和 local 分别加载设置
    const [syncResult, localResult] = await Promise.all([
      chrome.storage.sync.get(['syncSettings']),
      chrome.storage.local.get(['localSettings', 'syncSettings'])
    ]);

    const syncSettings = syncResult.syncSettings || {};
    const localSettings = localResult.localSettings || {};
    const localSyncSettings = localResult.syncSettings || {};

    // 优先从 local syncSettings 读取（因为保存时总是先保存到 local），其次从 sync 读取
    const effectiveSyncSettings = { ...syncSettings, ...localSyncSettings };

    // 兼容旧版本：如果新格式不存在，尝试从旧格式加载
    let mergedSettings = { ...effectiveSyncSettings, ...localSettings };

    // 如果新格式为空，尝试从旧格式加载
    if (Object.keys(mergedSettings).length === 0) {
      const oldResult = await chrome.storage.local.get(['settings']);
      if (oldResult.settings) {
        mergedSettings = oldResult.settings;
      }
    }

    if (mergedSettings) {
      settings = {
        showNodeType: mergedSettings.showNodeType || false,
        dualColumn: mergedSettings.dualColumn || false,
        autoDelete: mergedSettings.autoDelete || false,
        autoSort: mergedSettings.autoSort || false,
        darkMode: mergedSettings.darkMode || false,
        smartConnect: mergedSettings.smartConnect || false
      };
    }

    // 应用深色模式
    applyDarkMode(settings.darkMode);
  } catch (error) {
    console.error('加载设置失败:', error);
  }
}

// 应用深色模式
function applyDarkMode(isDark) {
  if (isDark) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

// 检查连接错误
async function checkConnectionError() {
  try {
    const result = await chrome.storage.local.get(['connectionError']);
    if (result.connectionError) {
      // 显示错误提示，引导用户打开设置
      const errorToast = document.createElement('div');
      errorToast.className = 'error-toast';
      errorToast.innerHTML = `
        <div style="margin-bottom: 8px;">⚠️ ${result.connectionError}</div>
        <button id="openSettingsBtn" style="
          background: #667eea;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          pointer-events: auto;
        ">打开设置</button>
      `;
      errorToast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 20px;
        background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        max-width: 320px;
        animation: slideIn 0.3s ease-out;
        pointer-events: none;
      `;

      // 让按钮可以点击
      const btnStyle = `
        background: #667eea;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        pointer-events: auto;
      `;

      document.body.appendChild(errorToast);

      // 添加点击事件
      document.getElementById('openSettingsBtn').addEventListener('click', () => {
        openSettings();
        errorToast.remove();
      });

      // 10秒后自动消失
      setTimeout(() => {
        errorToast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => errorToast.remove(), 300);
      }, 10000);

      // 清除错误状态，避免重复显示
      await chrome.storage.local.set({ connectionError: null });
    }
  } catch (error) {
    console.error('检查连接错误失败:', error);
  }
}

async function checkTestProgress() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getTestProgress'
    });

    if (response && response.isTesting) {
      // 有测试正在进行，恢复进度显示
      const btn = document.getElementById('testAllDelays');
      const progress = response.progress;

      if (progress) {
        btn.textContent = `${currentTranslations.testProgress || '测试进度'} ${progress.completed}/${progress.total}`;
        startProgressMonitor();
      } else {
        btn.textContent = currentTranslations.testing || '测试中...';
      }

      btn.disabled = true;
      showToast(currentTranslations.testInProgressDetected || '检测到正在进行的测试...');
    }
  } catch (error) {
    console.error('检查测试进度失败:', error);
  }
}

function startProgressMonitor() {
  let progressListener = null;

  progressListener = (changes, area) => {
    if (area === 'local') {
      // 检查测试是否完成
      if (changes.isTesting && !changes.isTesting.newValue) {
        // 测试完成
        const btn = document.getElementById('testAllDelays');
        btn.textContent = currentTranslations.testAll || '测试延迟';
        btn.disabled = false;

        // 移除监听器
        chrome.storage.onChanged.removeListener(progressListener);

        // 重新加载节点
        loadNodes();
        return;
      }

      // 更新进度显示和节点延迟
      if (changes.testProgress && changes.testProgress.newValue) {
        const progress = changes.testProgress.newValue;
        const btn = document.getElementById('testAllDelays');

        if (progress && progress.total) {
          btn.textContent = `${currentTranslations.testProgress || '测试进度'} ${progress.completed}/${progress.total}`;

          // 实时更新已测试节点的延迟显示
          if (progress.current && progress.current.length > 0) {
            const nodeList = document.getElementById('nodeList');

            progress.current.forEach(result => {
              const nodeItem = nodeList.querySelector(`[data-name="${result.name}"]`);
              if (nodeItem) {
                const latencySpan = nodeItem.querySelector('.node-latency');
                const testBtn = nodeItem.querySelector('.btn-test');

                if (latencySpan) {
                  const latencyClass = getLatencyClass(result.delay);
                  latencySpan.textContent = result.delay >= 0 ? `${result.delay}ms` : '超时';
                  latencySpan.className = `node-latency ${latencyClass}`;
                }

                if (testBtn) {
                  testBtn.disabled = false;
                  testBtn.textContent = currentTranslations.test || '测试';
                }
              }
            });
          }
        }
      }
    }
  };

  chrome.storage.onChanged.addListener(progressListener);
}

function setupEventListeners() {
  document.getElementById('updateNodes').addEventListener('click', updateNodes);
  document.getElementById('searchNode').addEventListener('input', filterNodes);

  // 添加测试延迟按钮事件
  const testDelayBtn = document.getElementById('testAllDelays');
  if (testDelayBtn) {
    testDelayBtn.addEventListener('click', testAllDelays);
  }

  // 深色模式切换
  const toggleDarkModeBtn = document.getElementById('toggleDarkMode');
  if (toggleDarkModeBtn) {
    toggleDarkModeBtn.addEventListener('click', toggleDarkMode);
    // 更新按钮图标
    toggleDarkModeBtn.textContent = settings.darkMode ? '☀️' : '🌙';
    toggleDarkModeBtn.title = settings.darkMode ?
      (currentTranslations.lightMode || '浅色模式') :
      (currentTranslations.darkMode || '深色模式');
  }

  // 添加打开设置按钮事件
  const openSettingsBtn = document.getElementById('openSettings');
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', openSettings);
  }

  // 模式切换
  const modeSelect = document.getElementById('modeSelect');
  if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
      switchMode(e.target.value);
    });
  }
}

// 切换深色模式
let isTogglingDarkMode = false; // 防止重复点击

async function toggleDarkMode() {
  // 防止重复点击
  if (isTogglingDarkMode) {
    console.log('正在切换深色模式，请稍候...');
    return;
  }

  isTogglingDarkMode = true;

  try {
    // 切换状态
    settings.darkMode = !settings.darkMode;

    // 应用深色模式
    applyDarkMode(settings.darkMode);

    // 保存到 syncSettings（跨设备同步）
    const [syncResult, localResult] = await Promise.all([
      chrome.storage.sync.get(['syncSettings']),
      chrome.storage.local.get(['syncSettings'])
    ]);
    const currentSettings = { ...(syncResult.syncSettings || {}), ...(localResult.syncSettings || {}) };

    const newSettings = {
      ...currentSettings,
      darkMode: settings.darkMode
    };

    // 同时保存到 sync 和 local
    await Promise.all([
      chrome.storage.sync.set({ syncSettings: newSettings }),
      chrome.storage.local.set({ syncSettings: newSettings })
    ]);

    console.log('深色模式已切换:', settings.darkMode ? '深色' : '浅色');

    // 更新按钮图标
    const btn = document.getElementById('toggleDarkMode');
    if (btn) {
      btn.textContent = settings.darkMode ? '☀️' : '🌙';
      btn.title = settings.darkMode ? (currentTranslations.lightMode || '浅色模式') : (currentTranslations.darkMode || '深色模式');
    }
  } catch (error) {
    console.error('切换深色模式失败:', error);
    // 如果失败，恢复原状态
    settings.darkMode = !settings.darkMode;
    applyDarkMode(settings.darkMode);
  } finally {
    isTogglingDarkMode = false;
  }
}

function openSettings() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('settings.html')
  });
}

// 切换模式
async function switchMode(mode) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'switchMode',
      mode: mode
    });

    if (response && response.success) {
      const modeText = mode === 'Global' ? (currentTranslations.global || '全局') :
                      mode === 'Rule' ? (currentTranslations.rule || '规则') :
                      (currentTranslations.direct || '直连');
      showToast(`${currentTranslations.switched || '已切换'}${modeText}${currentTranslations.mode || '模式'}`);
    } else {
      showToast(`${currentTranslations.switchFailed || '切换失败'}: ${response?.error || 'Unknown error'}`);
    }
  } catch (error) {
    showToast(`错误: ${error.message}`);
  }
}

// 加载当前模式
async function loadCurrentMode() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getCurrentMode'
    });

    if (response && response.success && response.mode) {
      const modeSelect = document.getElementById('modeSelect');
      if (modeSelect) {
        // 确保模式值首字母大写
        const mode = response.mode.charAt(0).toUpperCase() + response.mode.slice(1).toLowerCase();
        modeSelect.value = mode;
      }
    }
  } catch (error) {
    console.error('加载当前模式失败:', error);
  }
}

// 加载流量信息
async function loadTrafficInfo() {
  try {
    const result = await chrome.storage.local.get(['trafficInfo', 'trafficError']);
    const trafficInfo = result.trafficInfo;
    const trafficError = result.trafficError;
    const trafficInfoEl = document.getElementById('trafficInfo');

    if (!trafficInfoEl) {
      return;
    }

    // 显示错误信息
    if (trafficError) {
      if (trafficError === 'CORS限制') {
        trafficInfoEl.innerHTML = '<span style="color: #ff6b6b; font-size: 11px;">⚠️ 部分订阅因浏览器限制无法获取</span>';
      } else {
        trafficInfoEl.innerHTML = `<span style="color: #ff6b6b; font-size: 11px;">⚠️ ${trafficError}</span>`;
      }
      return;
    }

    if (!trafficInfo) {
      trafficInfoEl.innerHTML = '';
      return;
    }

    // 检查是否是无限流量
    if (trafficInfo.total === '∞ GB') {
      const usedMatch = trafficInfo.used?.match(/([\d.]+)\s*GB/);
      const used = usedMatch ? usedMatch[1] : '?';
      trafficInfoEl.innerHTML = `📊 ${used}GB/∞`;
      return;
    }

    // 简化显示格式：0.75/100GB (0.75%)
    const usedMatch = trafficInfo.used?.match(/([\d.]+)\s*GB/);
    const totalMatch = trafficInfo.total?.match(/([\d.]+)\s*GB/);
    const remainingMatch = trafficInfo.remaining?.match(/[\d.]+\s*GB\s*\(([\d.]+)%\)/);

    if (usedMatch && totalMatch && remainingMatch) {
      const used = usedMatch[1];
      const total = totalMatch[1];
      const percent = remainingMatch[1];
      trafficInfoEl.innerHTML = `📊 ${used}/${total}GB (${percent}%)`;
    } else if (trafficInfo.used || trafficInfo.total) {
      // 如果解析失败，显示简单格式
      trafficInfoEl.innerHTML = `📊 ${trafficInfo.used || '?'}/${trafficInfo.total || '?'}`;
    } else {
      trafficInfoEl.innerHTML = '';
    }
  } catch (error) {
    console.error('加载流量信息失败:', error);
  }
}

async function loadNodes() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getNodes'
    });

    if (response && response.success) {
      nodes = response.nodes;
      console.log(`加载了 ${nodes.length} 个节点`);
      renderNodes();
    } else {
      console.error('加载失败:', response?.error);
    }
  } catch (error) {
    console.error('加载节点出错:', error);
  }
}

async function updateNodes() {
  const btn = document.getElementById('updateNodes');
  const originalText = btn.textContent;
  btn.textContent = currentTranslations.loading || '加载中...';
  btn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'reloadNodes'
    });

    if (response && response.success) {
      nodes = response.nodes;

      // 更新 storage 中的 currentNode
      if (response.currentNode) {
        await chrome.storage.local.set({ currentNode: response.currentNode });
      }

      renderNodes();
      showToast(`✅ ${response.message || currentTranslations.configSaved || '重新加载成功'}`);
    } else {
      showToast(`❌ ${response?.error || currentTranslations.loadFailed || '重新加载失败'}`);
    }
  } catch (error) {
    showToast(`❌ ${error.message}`);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function connectNode(nodeName) {
  const node = nodes.find(n => n.name === nodeName);
  if (!node) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'connect',
      node: node
    });

    if (response && response.success) {
      showToast(`Connected: ${nodeName}`);
      updateStatus();
      renderNodes();
    } else {
      showToast(`Failed: ${response?.error || 'Unknown error'}`);
    }
  } catch (error) {
    showToast(`Error: ${error.message}`);
  }
}

async function disconnect() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'disconnect'
    });

    if (response && response.success) {
      showToast('Disconnected');
      updateStatus();
      renderNodes();
    } else {
      showToast(`Error: ${response?.error || 'Failed'}`);
    }
  } catch (error) {
    showToast(`Error: ${error.message}`);
  }
}

function updateStatus() {
  chrome.storage.local.get(['currentNode'], (result) => {
    const statusEl = document.getElementById('status');

    if (result.currentNode) {
      statusEl.classList.add('connected');
    } else {
      statusEl.classList.remove('connected');
    }
  });
}

function renderNodes(filterText = '') {
  const nodeList = document.getElementById('nodeList');
  const nodeCount = document.getElementById('nodeCount');

  let filteredNodes = nodes;

  // 自动删除无效配置
  if (settings.autoDelete) {
    filteredNodes = filteredNodes.filter(node => {
      // 延迟为 -1 或节点不可用时删除
      if (node.latency === -1 || !node.alive) {
        return false;
      }
      return true;
    });
  }

  // 搜索过滤
  if (filterText) {
    filteredNodes = filteredNodes.filter(node =>
      node.name.toLowerCase().includes(filterText.toLowerCase())
    );
  }

  // 获取当前连接的节点和收藏列表
  chrome.storage.local.get(['currentNode', 'favoriteNodes'], (result) => {
    const currentNode = result.currentNode || '';
    const favoriteNodes = result.favoriteNodes || [];

    // 已连接节点置顶，收藏节点次之
    if (currentNode) {
      filteredNodes.sort((a, b) => {
        if (a.name === currentNode) return -1;
        if (b.name === currentNode) return 1;

        // 都不是当前节点，检查是否收藏
        const aFav = favoriteNodes.includes(a.name);
        const bFav = favoriteNodes.includes(b.name);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;

        // 都收藏或都未收藏，按延迟排序（如果启用了自动排序）
        if (settings.autoSort) {
          const aDelay = a.latency === null || a.latency === -1 ? 9999 : a.latency;
          const bDelay = b.latency === null || b.latency === -1 ? 9999 : b.latency;
          return aDelay - bDelay;
        }
        return 0;
      });
    } else {
      // 没有当前连接
      filteredNodes.sort((a, b) => {
        const aFav = favoriteNodes.includes(a.name);
        const bFav = favoriteNodes.includes(b.name);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;

        if (settings.autoSort) {
          const aDelay = a.latency === null || a.latency === -1 ? 9999 : a.latency;
          const bDelay = b.latency === null || b.latency === -1 ? 9999 : b.latency;
          return aDelay - bDelay;
        }
        return 0;
      });
    }

    nodeCount.textContent = `(${filteredNodes.length})`;

    if (filteredNodes.length === 0) {
      nodeList.innerHTML = `<div class="empty-state">${currentTranslations.noNodes || '暂无节点，请添加订阅'}</div>`;
      return;
    }

    // 应用双列显示样式
    if (settings.dualColumn) {
      nodeList.classList.add('dual-column');
    } else {
      nodeList.classList.remove('dual-column');
    }

    nodeList.innerHTML = filteredNodes.map(node => {
      const latencyClass = getLatencyClass(node.latency);
      const latencyText = node.latency ? `${node.latency}ms` : (currentTranslations.untested || '未测试');
      const isCurrent = node.name === currentNode;
      const isFavorite = favoriteNodes.includes(node.name);

      // 根据设置决定是否显示节点类型
      const typeInfo = settings.showNodeType ?
        `<span>${translateNodeType(node.type)}</span>` : '';

      // 当前连接标识
      const currentBadge = isCurrent ? `<span class="current-badge">${currentTranslations.currentBadge || '✓ 当前连接'}</span>` : '';

      // 收藏星标
      const favoriteStar = isFavorite ? '⭐' : '☆';

      return `
        <div class="node-item ${isCurrent ? 'active' : ''} ${isFavorite ? 'favorite' : ''}" data-name="${node.name}">
          <div class="node-header">
            <span class="node-name">${node.name}</span>
            <div class="node-actions">
              ${currentBadge}
              <span class="node-latency ${latencyClass}">${latencyText}</span>
              <button class="btn-favorite" data-name="${node.name}" title="${isFavorite ? (currentTranslations.unfavorite || '取消收藏') : (currentTranslations.favorite || '收藏')}">${favoriteStar}</button>
              <button class="btn-test" data-name="${node.name}">${currentTranslations.test || '测试'}</button>
            </div>
          </div>
          <div class="node-info">
            ${typeInfo}
            <span>${node.alive ? (currentTranslations.nodeAvailable || '✓ 可用') : (currentTranslations.nodeUnavailable || '✗ 不可用')}</span>
          </div>
        </div>
      `;
    }).join('');

    // 添加节点点击事件
    nodeList.querySelectorAll('.node-item').forEach(item => {
      // 右键菜单
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const nodeName = item.dataset.name;
        showContextMenu(e, nodeName);
      });

      item.addEventListener('click', (e) => {
        // 如果点击的是收藏按钮
        if (e.target.classList.contains('btn-favorite')) {
          e.stopPropagation();
          toggleFavorite(e.target.dataset.name);
        }
        // 如果点击的是测试按钮，不切换节点
        else if (e.target.classList.contains('btn-test')) {
          e.stopPropagation();
          testSingleDelay(e.target.dataset.name);
        } else {
          // 点击节点本身，切换连接
          connectNode(item.dataset.name);
        }
      });
    });
  });
}

// ==================== 收藏功能 ====================

// 切换收藏状态
async function toggleFavorite(nodeName) {
  try {
    const result = await chrome.storage.local.get(['favoriteNodes']);
    let favoriteNodes = result.favoriteNodes || [];

    if (favoriteNodes.includes(nodeName)) {
      // 取消收藏
      favoriteNodes = favoriteNodes.filter(name => name !== nodeName);
      showToast(currentTranslations.unfavorite || '已取消收藏');
    } else {
      // 添加收藏
      favoriteNodes.push(nodeName);
      showToast(currentTranslations.favorite || '已收藏');
    }

    await chrome.storage.local.set({ favoriteNodes });

    // 重新渲染节点列表
    renderNodes();
  } catch (error) {
    console.error('收藏操作失败:', error);
    showToast('操作失败');
  }
}

// 显示右键菜单
function showContextMenu(event, nodeName) {
  // 移除旧的右键菜单
  const oldMenu = document.querySelector('.context-menu');
  if (oldMenu) {
    oldMenu.remove();
  }

  // 获取收藏状态
  chrome.storage.local.get(['favoriteNodes'], (result) => {
    const favoriteNodes = result.favoriteNodes || [];
    const isFavorite = favoriteNodes.includes(nodeName);

    // 创建右键菜单
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.innerHTML = `
      <div class="context-menu-item" data-action="connect">${currentTranslations.contextConnect || '🔗 连接'}</div>
      <div class="context-menu-item" data-action="favorite">${isFavorite ? `☆ ${currentTranslations.unfavorite || '取消收藏'}` : `⭐ ${currentTranslations.favorite || '收藏'}`}</div>
      <div class="context-menu-item" data-action="test">${currentTranslations.contextTestDelay || '⚡ 测试延迟'}</div>
    `;

    // 设置位置
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';

    document.body.appendChild(menu);

    // 添加菜单项点击事件
    menu.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        if (action === 'connect') {
          connectNode(nodeName);
        } else if (action === 'favorite') {
          toggleFavorite(nodeName);
        } else if (action === 'test') {
          testSingleDelay(nodeName);
        }
        menu.remove();
      });
    });

    // 点击其他地方关闭菜单
    setTimeout(() => {
      document.addEventListener('click', function closeMenu() {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }, { once: true });
    }, 100);
  });
}

function getLatencyClass(latency) {
  if (!latency) return 'latency-unknown';
  if (latency < 0) return 'latency-slow';
  if (latency < 100) return 'latency-fast';
  if (latency < 300) return 'latency-medium';
  return 'latency-slow';
}

function filterNodes(e) {
  renderNodes(e.target.value);
}

async function testAllDelays() {
  const btn = document.getElementById('testAllDelays');
  btn.textContent = currentTranslations.testing || '测试中...';
  btn.disabled = true;

  // 先将所有节点显示为测试中
  const nodeList = document.getElementById('nodeList');
  nodeList.querySelectorAll('.node-latency').forEach(latencySpan => {
    latencySpan.textContent = '...';
    latencySpan.className = 'node-latency latency-testing';
  });
  nodeList.querySelectorAll('.btn-test').forEach(testBtn => {
    testBtn.disabled = true;
    testBtn.textContent = currentTranslations.testing || '测试中';
  });

  try {
    showToast(currentTranslations.startTestAll || '开始测试所有节点');

    // 启动进度监听
    startProgressMonitor();

    const response = await chrome.runtime.sendMessage({
      action: 'testAllDelays'
    });

    if (response && response.success) {
      // 更新节点的延迟信息
      const delayMap = {};
      response.results.forEach(r => {
        delayMap[r.name] = r.delay;
      });

      // 更新 nodes 数组
      // 注意：如果节点在 delayMap 中没有记录，说明没有被测试，标记为 -1
      nodes = nodes.map(node => {
        if (node.name in delayMap) {
          return {
            ...node,
            latency: delayMap[node.name]
          };
        } else {
          // 没有测试结果的节点，标记为 -1（失败）
          const warning = (currentTranslations.nodeNoTestResult || '节点 {name} 没有测试结果').replace('{name}', node.name);
          console.warn(warning);
          return {
            ...node,
            latency: -1
          };
        }
      });

      // 按延迟排序
      nodes.sort((a, b) => {
        const aDelay = a.latency === null || a.latency === -1 ? 9999 : a.latency;
        const bDelay = b.latency === null || b.latency === -1 ? 9999 : b.latency;
        return aDelay - bDelay;
      });

      renderNodes();

      // 找出最快的有效节点
      const fastestValid = response.results.find(r => r.delay > 0);
      if (fastestValid) {
        const msg = (currentTranslations.testCompleteFastest || '✅ 测试完成！最快: {name} ({delay}ms)')
          .replace('{name}', fastestValid.name)
          .replace('{delay}', fastestValid.delay);
        showToast(msg);
      } else {
        showToast(currentTranslations.testCompleteAllUnavailable || '✅ 测试完成，但所有节点都不可用');
      }
    } else {
      // 如果是因为已经在测试中
      if (response && response.isTesting) {
        showToast(currentTranslations.testInProgress || '⚠️ 测试正在进行中，请稍候...');
        return;
      }
      showToast(currentTranslations.testFailed || '❌ 测试失败');
      // 恢复按钮状态
      renderNodes();
    }
  } catch (error) {
    showToast(`❌ ${error.message}`);
    // 恢复按钮状态
    renderNodes();
  }
}

async function testSingleDelay(nodeName) {
  const nodeList = document.getElementById('nodeList');
  const nodeItem = nodeList.querySelector(`[data-name="${nodeName}"]`);
  const latencySpan = nodeItem?.querySelector('.node-latency');
  const testBtn = nodeItem?.querySelector('.btn-test');

  // 禁用按钮，显示测试中状态
  if (testBtn) {
    testBtn.disabled = true;
    testBtn.textContent = currentTranslations.testing || '测试中';
  }
  if (latencySpan) {
    latencySpan.textContent = '...';
    latencySpan.className = 'node-latency latency-testing';
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'testDelay',
      nodeName: nodeName
    });

    if (response && response.success) {
      // 更新该节点的延迟
      const node = nodes.find(n => n.name === nodeName);
      if (node) {
        node.latency = response.delay;
        // 更新显示
        const latencyClass = getLatencyClass(response.delay);
        if (latencySpan) {
          latencySpan.textContent = `${response.delay}ms`;
          latencySpan.className = `node-latency ${latencyClass}`;
        }
        // 如果启用了自动排序，重新渲染
        if (settings.autoSort) {
          renderNodes();
        }
      }
      const msg = (currentTranslations.latencyResult || '延迟: {delay}ms').replace('{delay}', response.delay);
      showToast(msg);
    } else {
      // 测试失败
      if (latencySpan) {
        latencySpan.textContent = currentTranslations.testError || '测试失败';
        latencySpan.className = 'node-latency latency-slow';
      }
      showToast(currentTranslations.testError || '测试失败');
    }
  } catch (error) {
    if (latencySpan) {
      latencySpan.textContent = '错误';
      latencySpan.className = 'node-latency latency-slow';
    }
    showToast(`错误: ${error.message}`);
  } finally {
    // 恢复按钮
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.textContent = currentTranslations.test || '测试';
    }
  }
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: #2ed573;
    color: white;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// 添加样式
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(400px); opacity: 0; }
  }
`;
document.head.appendChild(style);

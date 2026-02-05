// Settings Page Logic
console.log('Settings loaded');

// 当前语言
let currentLang = 'zh_CN';
let currentTranslations = {};  // 缓存当前翻译

// 防止在保存过程中重新加载设置的标志
let isSavingSettings = false;
// 防止在导入过程中重新加载设置的标志
let isImportingConfig = false;

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

// 应用翻译
async function applyTranslations(lang) {
  const messages = await loadLocaleMessages(lang);
  if (!messages) {
    console.error('Failed to load translations for:', lang);
    return;
  }

  // 缓存翻译供后续使用
  currentTranslations = messages;

  // 定义翻译映射：选择器 -> messages key
  const translationMap = {
    // 侧边栏
    '.sidebar-title span:last-child': 'settings',
    '[data-panel="api"] .menu-icon + span': 'apiConfig',
    '[data-panel="display"] .menu-icon + span': 'display',
    '[data-panel="nodes"] .menu-icon + span': 'nodes',
    '[data-panel="data"] .menu-icon + span': 'dataManagement',
    '[data-panel="sponsor"] .menu-icon + span': 'sponsor',

    // API 配置面板
    '#panel-api .input-label[for="apiUrl"]': 'apiUrl',
    '#panel-api .input-hint:first-of-type': 'apiUrlHint',
    '#panel-api .input-label[for="apiSecret"]': 'apiSecret',
    '#panel-api .input-hint:last-of-type': 'apiSecretHint',
    '#panel-api .sub-title': 'subscriptions',
    '#panel-api .btn-block': 'addSubscription',

    // 显示面板
    '#panel-display .input-label[for="languageSelect"]': 'languageSelect',
    '#toggleNodeType .toggle-label': 'showNodeType',
    '#toggleDualColumn .toggle-label': 'dualColumn',
    '#toggleDarkMode .toggle-label': 'darkMode',

    // 节点面板
    '#toggleAutoDelete .toggle-label': 'autoDelete',
    '#toggleAutoSort .toggle-label': 'autoSort',
    '#toggleSmartConnect .toggle-label': 'smartConnect',
    '#panel-nodes .input-label[for="smartConnectKeywords"]': 'smartConnectKeywords',
    '#panel-nodes .input-group:nth-of-type(4) .input-hint': 'smartConnectKeywordsHint',
    '#panel-nodes .sub-title': 'advanced',
    '#panel-nodes .input-label[for="testConcurrency"]': 'testConcurrency',
    '#panel-nodes .input-group:nth-of-type(5) .input-hint': 'testConcurrencyHint',
    '#panel-nodes .input-label[for="testUrl"]': 'testUrl',
    '#panel-nodes .input-group:nth-of-type(6) .input-hint': 'testUrlHint',

    // 数据面板
    '#btnExport': 'export',
    '#btnImport': 'import',
    '#btnClearData': 'clearData',
    '#btnSyncNow': 'syncNow',
    '#panel-data span[data-i18n="cloudSyncStatus"]': 'cloudSyncStatus',

    // 赞助面板
    '#panel-sponsor h2': 'sponsorTitle',
    '#panel-sponsor p[data-i18n="sponsorDesc"]': 'sponsorDesc',
    '#panel-sponsor p[data-i18n="alipay"]': 'alipay',
    '#panel-sponsor p[data-i18n="wechat"]': 'wechat',
    '#panel-sponsor p[data-i18n="scanToDonate"]': 'scanToDonate',

    // 底部按钮
    '#btnCancel': 'cancel',

    // 删除按钮
    '.btn-delete-sub': 'delete',

    // 对话框
    '#subscriptionDialog .dialog-header h3': 'addSubscriptionTitle',
    '#subscriptionDialog .input-label[for="subName"]': 'subscriptionName',
    '#subscriptionDialog .input-label[for="subUrl"]': 'subscriptionUrl',
    '#cancelSubBtn': 'cancel',
    '#saveSubBtn': 'save'
  };

  // 应用翻译
  for (const selector in translationMap) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      const key = translationMap[selector];
      if (messages[key]) {
        el.textContent = messages[key];
      }
    });
  }

  // 特殊处理：warning box
  const warningBox = document.querySelector('#panel-data .warning-box');
  if (warningBox && messages.securityWarning) {
    warningBox.textContent = `⚠️ ${messages.securityWarning}`;
  }

  // 特殊处理：empty subscriptions
  const emptyDiv = document.querySelector('.empty-subscriptions');
  if (emptyDiv && messages.emptySubscriptions) {
    emptyDiv.textContent = messages.emptySubscriptions;
  }

  currentLang = lang;

  // 更新标题
  const activeMenu = document.querySelector('.menu-item.active');
  if (activeMenu) {
    const icon = activeMenu.querySelector('.menu-icon').textContent;
    const text = activeMenu.querySelector('span:last-child').textContent;
    document.getElementById('contentTitle').innerHTML = `<span>${icon}</span><span>${text}</span>`;
  }

  // 更新同步说明框
  updateSyncInfoBox();
}

// 翻译辅助函数 - 获取翻译文本
function t(key, fallback = '') {
  return currentTranslations[key] || fallback;
}

// 自动保存的定时器
let autoSaveTimer = null;
let editingSubscriptionIndex = -1; // -1 表示添加新订阅，>=0 表示编辑现有订阅

// 云同步定时器
let syncTimer = null;

// ==================== 云同步功能 ====================

// 更新同步状态显示
async function updateSyncStatus() {
  const syncStatusText = document.getElementById('syncStatusText');
  const syncTime = document.getElementById('syncTime');

  if (!syncStatusText || !syncTime) return;

  try {
    // 从 local 读取 syncSettings（因为 local 总是最新的）
    const localResult = await chrome.storage.local.get(['syncSettings']);
    // 从 sync 读取最后同步时间
    const syncResult = await chrome.storage.sync.get(['lastSyncTime']);

    // 检查是否有保存过的设置
    const hasSettings = localResult.syncSettings && Object.keys(localResult.syncSettings).length > 0;

    if (hasSettings) {
      // 显示最后同步时间
      if (syncResult.lastSyncTime) {
        const lastSync = new Date(syncResult.lastSyncTime);
        const timeStr = lastSync.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        syncStatusText.textContent = t('syncedAt', `✓ 已同步 ${timeStr}`).replace('{time}', timeStr);
        syncTime.textContent = '';
      } else {
        syncStatusText.textContent = t('syncEnabled', '✓ 已启用云同步');
        syncTime.textContent = '';
      }
    } else {
      syncStatusText.textContent = t('syncDisabled', '✗ 未启用云同步');
      syncTime.textContent = '';
    }
  } catch (error) {
    console.error('检查同步状态失败:', error);
    syncStatusText.textContent = t('syncFailed', '✗ 同步失败');
    syncTime.textContent = '';
  }
}

// 格式化同步时间
function formatSyncTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {
    return '刚刚';
  } else if (diffMins < 60) {
    return `${diffMins} 分钟前`;
  } else if (diffMins < 1440) {
    const hours = Math.floor(diffMins / 60);
    return `${hours} 小时前`;
  } else {
    return date.toLocaleDateString();
  }
}

// 手动同步
async function manualSync() {
  const syncStatusText = document.getElementById('syncStatusText');
  const syncTime = document.getElementById('syncTime');

  if (!syncStatusText) return;

  syncStatusText.textContent = t('syncChecking', '检查中...');

  try {
    // 读取本地 syncSettings
    const localResult = await chrome.storage.local.get(['syncSettings']);

    // 写入 chrome.storage.sync 触发同步
    if (localResult.syncSettings) {
      await chrome.storage.sync.set({ syncSettings: localResult.syncSettings });

      // 记录同步时间
      const now = new Date().toISOString();
      await chrome.storage.local.set({ lastSyncTime: now });
      await chrome.storage.sync.set({ lastSyncTime: now });

      // 更新显示
      const timeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      syncStatusText.textContent = t('syncedAt', `✓ 已同步 ${timeStr}`).replace('{time}', timeStr);
      syncTime.textContent = '';

      showToast(t('syncSuccess', '✓ 同步成功'));
    } else {
      syncStatusText.textContent = t('syncDisabled', '✗ 未启用云同步');
      syncTime.textContent = '';
    }
  } catch (error) {
    console.error('同步失败:', error);
    syncStatusText.textContent = t('syncFailed', '✗ 同步失败');
    showToast('❌ ' + t('syncFailed', '同步失败'));
  }
}

// 启动定时同步
function startSyncTimer() {
  // 每 5 分钟自动同步一次
  if (syncTimer) {
    clearInterval(syncTimer);
  }

  syncTimer = setInterval(async () => {
    try {
      const result = await chrome.storage.local.get(['syncSettings']);
      if (result.syncSettings) {
        await chrome.storage.sync.set({ syncSettings: result.syncSettings });

        const now = new Date().toISOString();
        await chrome.storage.local.set({ lastSyncTime: now });
        await chrome.storage.sync.set({ lastSyncTime: now });

        // 如果当前在数据管理面板，更新显示
        const dataPanel = document.getElementById('panel-data');
        if (dataPanel && dataPanel.classList.contains('active')) {
          const syncStatusText = document.getElementById('syncStatusText');
          if (syncStatusText) {
            const timeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            syncStatusText.textContent = t('syncedAt', `✓ 已同步 ${timeStr}`).replace('{time}', timeStr);
          }
        }
      }
    } catch (error) {
      console.error('自动同步失败:', error);
    }
  }, 5 * 60 * 1000); // 5 分钟
}

document.addEventListener('DOMContentLoaded', async () => {
  // 先加载设置（包括应用翻译）
  await loadSettings();
  // 然后加载订阅（此时翻译已应用）
  await loadSubscriptions();
  setupEventListeners();
  // 添加 toast 样式
  addToastStyles();

  // 初始化同步状态
  await updateSyncStatus();
  // 启动定时同步
  startSyncTimer();

  // 监听 storage 变化，自动更新显示
  chrome.storage.onChanged.addListener((changes, area) => {
    // 如果正在保存设置或导入配置，跳过重新加载（避免竞争条件）
    if (isSavingSettings || isImportingConfig) {
      return;
    }

    // 监听 subscriptions 变化
    if (area === 'local' && changes.subscriptions) {
      loadSubscriptions();
    }

    // 监听 syncSettings 变化（包括 darkMode）
    if (area === 'sync' && changes.syncSettings) {
      loadSettings();
    }

    // 监听 local storage 中的 syncSettings 变化
    if (area === 'local' && changes.syncSettings) {
      loadSettings();
    }

    // 监听 localSettings 变化
    if (area === 'local' && changes.localSettings) {
      loadSettings();
    }
  });
});

function setupEventListeners() {
  // 侧边栏导航
  const menuItems = document.querySelectorAll('.menu-item');
  const panels = document.querySelectorAll('.panel');
  const contentTitle = document.getElementById('contentTitle');

  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      const panelId = item.dataset.panel;

      // 更新菜单激活状态
      menuItems.forEach(mi => mi.classList.remove('active'));
      item.classList.add('active');

      // 更新面板显示
      panels.forEach(panel => panel.classList.remove('active'));
      document.getElementById(`panel-${panelId}`).classList.add('active');

      // 更新标题
      const icon = item.querySelector('.menu-icon').textContent;
      const text = item.querySelector('span:last-child').textContent;
      contentTitle.innerHTML = `<span>${icon}</span><span>${text}</span>`;

      // 重新应用翻译（确保隐藏面板的内容也被翻译）
      applyTranslations(currentLang);

      // 如果切换到数据管理面板，更新同步状态
      if (panelId === 'data') {
        updateSyncStatus();
        updateSyncInfoBox();
      }
    });
  });

  document.getElementById('btnCancel').addEventListener('click', () => {
    window.close();
  });

  // 清除数据按钮
  const btnClearData = document.getElementById('btnClearData');
  if (btnClearData) {
    btnClearData.addEventListener('click', clearAllData);
  }

  // 导入导出按钮
  const btnExport = document.getElementById('btnExport');
  if (btnExport) {
    btnExport.addEventListener('click', exportConfig);
  }

  const btnImport = document.getElementById('btnImport');
  if (btnImport) {
    btnImport.addEventListener('click', () => {
      document.getElementById('importFileInput').click();
    });
  }

  const importFileInput = document.getElementById('importFileInput');
  if (importFileInput) {
    importFileInput.addEventListener('change', importConfig);
  }

  // 同步按钮
  const btnSyncNow = document.getElementById('btnSyncNow');
  if (btnSyncNow) {
    btnSyncNow.addEventListener('click', manualSync);
  }

  // API 地址输入框 - 输入时自动保存
  const apiUrlInput = document.getElementById('apiUrl');
  apiUrlInput.addEventListener('input', () => {
    scheduleAutoSave();
  });

  // 密钥输入框 - 输入时自动保存
  const apiSecretInput = document.getElementById('apiSecret');
  apiSecretInput.addEventListener('input', () => {
    scheduleAutoSave();
  });

  // 智能连接关键词输入框 - 输入时自动保存
  const keywordsInput = document.getElementById('smartConnectKeywords');
  keywordsInput.addEventListener('input', () => {
    scheduleAutoSave();
  });

  // 并发测试数量 - 输入时自动保存
  const concurrencyInput = document.getElementById('testConcurrency');
  if (concurrencyInput) {
    concurrencyInput.addEventListener('input', () => {
      scheduleAutoSave();
    });
  }

  // 测速目标地址 - 输入时自动保存
  const testUrlInput = document.getElementById('testUrl');
  if (testUrlInput) {
    testUrlInput.addEventListener('input', () => {
      scheduleAutoSave();
    });
  }

  // 语言选择 - 立即切换
  const languageSelect = document.getElementById('languageSelect');
  if (languageSelect) {
    languageSelect.addEventListener('change', async (e) => {
      const newLang = e.target.value;

      // 保存语言设置
      await chrome.storage.local.set({ language: newLang });

      // 应用翻译
      await applyTranslations(newLang);

      // 更新同步说明
      updateSyncInfoBox();

      // 重新渲染订阅列表以应用新语言
      const result = await chrome.storage.local.get(['subscriptions']);
      const subscriptions = result.subscriptions || [];
      renderSubscriptions(subscriptions);

      // 显示提示
      const messages = {
        zh_CN: '✓ 语言已切换',
        zh_TW: '✓ 語言已切換',
        en: '✓ Language switched'
      };
      showToast(messages[newLang] || messages.zh_CN);
    });
  }

  // 订阅管理按钮
  const addSubscriptionBtn = document.getElementById('addSubscriptionBtn');
  if (addSubscriptionBtn) {
    addSubscriptionBtn.addEventListener('click', openSubscriptionDialog);
  }

  // 订阅对话框按钮
  const closeDialogBtn = document.getElementById('closeDialogBtn');
  if (closeDialogBtn) {
    closeDialogBtn.addEventListener('click', closeSubscriptionDialog);
  }

  const cancelSubBtn = document.getElementById('cancelSubBtn');
  if (cancelSubBtn) {
    cancelSubBtn.addEventListener('click', closeSubscriptionDialog);
  }

  const saveSubBtn = document.getElementById('saveSubBtn');
  if (saveSubBtn) {
    saveSubBtn.addEventListener('click', saveSubscription);
  }

  // 订阅列表事件委托（处理删除和显示/隐藏按钮）
  const subscriptionList = document.getElementById('subscriptionList');
  if (subscriptionList) {
    subscriptionList.addEventListener('click', (e) => {
      // 处理删除按钮
      if (e.target.classList.contains('btn-delete-sub')) {
        const index = parseInt(e.target.dataset.index);
        if (!isNaN(index)) {
          deleteSubscription(index);
        }
      }
      // 处理显示/隐藏按钮
      else if (e.target.classList.contains('btn-view-url')) {
        toggleSubscriptionVisibility(e.target);
      }
    });
  }

  // 设置所有开关的点击事件 - 切换时自动保存
  setupToggle('toggleNodeType', 'nodeTypeSwitch', 'showNodeType');
  setupToggle('toggleDualColumn', 'dualColumnSwitch', 'dualColumn');
  setupToggle('toggleDarkMode', 'darkModeSwitch', 'darkMode');
  setupToggle('toggleAutoDelete', 'autoDeleteSwitch', 'autoDelete');
  setupToggle('toggleAutoSort', 'autoSortSwitch', 'autoSort');
  setupToggle('toggleSmartConnect', 'smartConnectSwitch', 'smartConnect');
}

// 订阅管理功能
// 用于存储真实 URL 的内存映射
const subscriptionUrlsMap = new Map();

async function loadSubscriptions() {
  try {
    const result = await chrome.storage.local.get(['subscriptions']);
    const subscriptions = result.subscriptions || [];

    // 将真实 URL 存储到内存 Map 中
    subscriptions.forEach((sub, index) => {
      subscriptionUrlsMap.set(index, sub.url);
    });

    renderSubscriptions(subscriptions);
  } catch (error) {
    console.error('加载订阅失败:', error);
  }
}

function renderSubscriptions(subscriptions) {
  const subscriptionList = document.getElementById('subscriptionList');
  const subscriptionCount = document.getElementById('subscriptionCount');

  // 更新订阅数量显示
  if (subscriptionCount) {
    const count = subscriptions ? subscriptions.length : 0;
    subscriptionCount.textContent = count > 0 ? `(${count}个)` : '';
  }

  if (!subscriptions || subscriptions.length === 0) {
    subscriptionList.innerHTML = '<div class="empty-subscriptions">暂无订阅，请添加</div>';
    return;
  }

  subscriptionList.innerHTML = subscriptions.map((sub, index) => {
    // 显示详细流量信息
    let trafficHtml;
    if (sub.traffic) {
      // 针对无限流量优化显示
      if (sub.traffic.isInfinite) {
        trafficHtml = `
          <div class="subscription-traffic">
            ${sub.traffic.used ? `<div class="traffic-item">${t('trafficUsed', '📊 已用:')} ${sub.traffic.used}</div>` : ''}
            <div class="traffic-item">${t('infiniteTraffic', '♾️ 无限流量')}</div>
          </div>
        `;
      } else {
        trafficHtml = `
          <div class="subscription-traffic">
            ${sub.traffic.used ? `<div class="traffic-item">${t('trafficUsed', '📊 已用:')} ${sub.traffic.used}</div>` : ''}
            ${sub.traffic.remaining ? `<div class="traffic-item">${t('trafficRemaining', '📦 剩余:')} ${sub.traffic.remaining}</div>` : ''}
          </div>
        `;
      }
    } else if (sub.trafficError) {
      // 如果标记为错误，显示错误信息
      trafficHtml = `<div class="subscription-traffic" style="font-size: 11px; color: #ff6b6b;">${t('corsError', '⚠️ CORS限制无法获取流量')}</div>`;
    } else {
      trafficHtml = `<div class="subscription-traffic" style="font-size: 11px; color: #999;">${t('loadingTraffic', '加载中...')}</div>`;
    }

    // 遮蔽订阅链接中的敏感信息
    const maskedUrl = maskSubscriptionUrl(sub.url);

    // 健康状态圆点
    const healthDot = getHealthDot(sub.healthStatus);

    return `
      <div class="subscription-item" data-index="${index}">
        <div class="subscription-header">
          <span class="subscription-name">${sub.name} ${healthDot}</span>
          <div class="subscription-actions">
            <button class="btn-view-url" data-index="${index}" title="${t('toggleUrlVisibility', '显示/隐藏链接')}">👁️</button>
            <button class="btn-delete-sub" data-index="${index}" data-lang-btn="delete">${t('delete', '删除')}</button>
          </div>
        </div>
        <div class="subscription-url blurred">${maskedUrl}</div>
        ${trafficHtml}
      </div>
    `;
  }).join('');
}

// 获取健康状态圆点
function getHealthDot(status) {
  switch (status) {
    case 'healthy':
      return `<span class="health-dot healthy" title="${t('healthyTitle', '健康')}"></span>`;
    case 'expired':
      return `<span class="health-dot expired" title="${t('expiredTitle', '链接失效或过期')}"></span>`;
    case 'down':
      return `<span class="health-dot down" title="${t('downTitle', '机场跑路或被封')}"></span>`;
    case 'error':
      return `<span class="health-dot error" title="${t('errorTitle', '连接失败')}"></span>`;
    default:
      return ''; // 未检查状态不显示圆点
  }
}

// 遮蔽订阅链接中的敏感信息
function maskSubscriptionUrl(url) {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    // 遮蔽 token、key 等敏感参数
    const sensitiveParams = ['token', 'key', 'secret', 'password', 'pass'];
    let masked = false;

    sensitiveParams.forEach(param => {
      if (params.has(param)) {
        const value = params.get(param);
        if (value && value.length > 8) {
          // 只显示前4位和后4位
          const maskedValue = value.substring(0, 4) + '***' + value.substring(value.length - 4);
          params.set(param, maskedValue);
          masked = true;
        }
      }
    });

    if (masked) {
      return urlObj.toString();
    }

    // 如果没有敏感参数，遮蔽整个路径
    const pathParts = urlObj.pathname.split('/');
    if (pathParts.length > 1) {
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart.length > 8) {
        pathParts[pathParts.length - 1] = lastPart.substring(0, 4) + '***' + lastPart.substring(lastPart.length - 4);
        urlObj.pathname = pathParts.join('/');
        return urlObj.toString();
      }
    }

    return url;
  } catch (e) {
    // 如果 URL 解析失败，尝试简单遮蔽
    if (url.length > 20) {
      return url.substring(0, 10) + '***' + url.substring(url.length - 7);
    }
    return url;
  }
}

// 切换订阅链接显示/隐藏
function toggleSubscriptionVisibility(button) {
  const subscriptionItem = button.closest('.subscription-item');
  const urlElement = subscriptionItem.querySelector('.subscription-url');
  const index = parseInt(subscriptionItem.dataset.index);
  const isBlurred = urlElement.classList.contains('blurred');

  if (isBlurred) {
    // 从内存 Map 中获取真实 URL
    const realUrl = subscriptionUrlsMap.get(index);
    if (realUrl) {
      urlElement.classList.remove('blurred');
      urlElement.textContent = realUrl;
      button.textContent = '🙈';
    }
  } else {
    // 重新遮蔽
    const realUrl = subscriptionUrlsMap.get(index);
    if (realUrl) {
      const maskedUrl = maskSubscriptionUrl(realUrl);
      urlElement.classList.add('blurred');
      urlElement.textContent = maskedUrl;
      button.textContent = '👁️';
    }
  }
}

async function openSubscriptionDialog() {
  editingSubscriptionIndex = -1;
  document.getElementById('subName').value = '';
  document.getElementById('subUrl').value = '';

  // 更新对话框标题为"添加订阅"
  const messages = await loadLocaleMessages(currentLang);
  if (messages && messages.addSubscriptionTitle) {
    const titleEl = document.querySelector('#subscriptionDialog .dialog-header h3');
    if (titleEl) {
      titleEl.textContent = messages.addSubscriptionTitle;
    }
  }

  document.getElementById('subscriptionDialog').style.display = 'flex';
}

function closeSubscriptionDialog() {
  document.getElementById('subscriptionDialog').style.display = 'none';
}

async function saveSubscription() {
  const name = document.getElementById('subName').value.trim();
  const url = document.getElementById('subUrl').value.trim();

  if (!name || !url) {
    showToast(t('fillSubscriptionFields', '请填写订阅名称和链接'));
    return;
  }

  try {
    const result = await chrome.storage.local.get(['subscriptions']);
    let subscriptions = result.subscriptions || [];

    const subscription = {
      name,
      url,
      traffic: null
    };

    if (editingSubscriptionIndex >= 0) {
      // 编辑现有订阅
      subscriptions[editingSubscriptionIndex] = subscription;
      showToast(t('subscriptionUpdated', '订阅已更新'));
    } else {
      // 添加新订阅
      subscriptions.push(subscription);
      showToast(t('subscriptionAdded', '订阅已添加'));
    }

    await chrome.storage.local.set({ subscriptions });
    renderSubscriptions(subscriptions);
    closeSubscriptionDialog();

    // 触发流量信息更新
    chrome.runtime.sendMessage({ action: 'updateTrafficInfo' });
  } catch (error) {
    console.error('保存订阅失败:', error);
    showToast(t('saveFailed', '保存失败'));
  }
}

async function deleteSubscription(index) {
  if (!confirm(t('confirmDeleteSubscription', '确定要删除这个订阅吗？'))) {
    return;
  }

  try {
    const result = await chrome.storage.local.get(['subscriptions']);
    let subscriptions = result.subscriptions || [];

    subscriptions.splice(index, 1);
    await chrome.storage.local.set({ subscriptions });
    renderSubscriptions(subscriptions);
    showToast(t('subscriptionDeleted', '订阅已删除'));

    // 触发流量信息更新
    chrome.runtime.sendMessage({ action: 'updateTrafficInfo' });
  } catch (error) {
    console.error('删除订阅失败:', error);
    showToast(t('deleteFailed', '删除失败'));
  }
}

// 延迟自动保存，避免频繁保存
function scheduleAutoSave() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  autoSaveTimer = setTimeout(() => {
    saveSettings();
  }, 500); // 500ms 后保存
}

function setupToggle(groupId, switchId, checkboxId) {
  const toggleGroup = document.getElementById(groupId);
  const toggleSwitch = document.getElementById(switchId);
  const checkbox = document.getElementById(checkboxId);

  // 只有点击按钮才能切换
  toggleSwitch.addEventListener('click', (e) => {
    e.stopPropagation(); // 阻止冒泡到 toggleGroup
    checkbox.checked = !checkbox.checked;
    updateToggleSwitch(switchId, checkbox);
    // 切换开关时立即保存
    saveSettings();
  });

  // checkbox change 事件也会触发
  checkbox.addEventListener('change', () => updateToggleSwitch(switchId, checkbox));
}

function updateToggleSwitch(switchId, checkbox) {
  const toggleSwitch = typeof switchId === 'string' ? document.getElementById(switchId) : switchId;

  if (checkbox.checked) {
    toggleSwitch.classList.add('active');
  } else {
    toggleSwitch.classList.remove('active');
  }
}

async function loadSettings() {
  try {
    // 从 sync 和 local 分别加载设置
    const [syncResult, localResult] = await Promise.all([
      chrome.storage.sync.get(['syncSettings']),
      chrome.storage.local.get(['localSettings', 'language', 'syncSettings'])
    ]);

    const syncSettings = syncResult.syncSettings || {};
    const localSettings = localResult.localSettings || {};
    const localSyncSettings = localResult.syncSettings || {};

    // 获取语言设置（直接从 storage 返回的结果中获取）
    const savedLang = localResult.language || 'zh_CN';

    // 优先从 local syncSettings 读取（因为保存时总是先保存到 local），其次从 sync 读取
    const effectiveSyncSettings = { ...syncSettings, ...localSyncSettings };

    // 合并设置
    const settings = {
      // 显示设置 - 使用 sync (跨设备同步)
      showNodeType: effectiveSyncSettings.showNodeType || false,
      dualColumn: effectiveSyncSettings.dualColumn || false,
      darkMode: effectiveSyncSettings.darkMode || false,
      autoDelete: effectiveSyncSettings.autoDelete || false,
      autoSort: effectiveSyncSettings.autoSort || false,
      smartConnect: effectiveSyncSettings.smartConnect || false,
      smartConnectKeywords: effectiveSyncSettings.smartConnectKeywords || '',
      testConcurrency: effectiveSyncSettings.testConcurrency || 10,
      testUrl: localSettings.testUrl || '',
      // API配置 - 从 syncSettings 中读取（保存时是存在这里的）
      apiUrl: effectiveSyncSettings.apiUrl || 'http://127.0.0.1:9999',
      apiSecret: effectiveSyncSettings.apiSecret || 'set-your-secret'
    };

    // 去除 http:// 前缀后再显示
    let displayUrl = settings.apiUrl || '127.0.0.1:9999';
    if (displayUrl.startsWith('http://')) {
      displayUrl = displayUrl.substring(7);
    } else if (displayUrl.startsWith('https://')) {
      displayUrl = displayUrl.substring(8);
    }

    document.getElementById('apiUrl').value = displayUrl;
    document.getElementById('apiSecret').value = settings.apiSecret;
    document.getElementById('smartConnectKeywords').value = settings.smartConnectKeywords || '';
    document.getElementById('testConcurrency').value = settings.testConcurrency;
    document.getElementById('testUrl').value = settings.testUrl || '';
    document.getElementById('languageSelect').value = savedLang;  // 设置语言选择框

    // 应用语言翻译（等待完成）
    await applyTranslations(savedLang);
    document.getElementById('showNodeType').checked = settings.showNodeType || false;
    document.getElementById('dualColumn').checked = settings.dualColumn || false;
    document.getElementById('darkMode').checked = settings.darkMode || false;
    document.getElementById('autoDelete').checked = settings.autoDelete || false;
    document.getElementById('autoSort').checked = settings.autoSort || false;
    document.getElementById('smartConnect').checked = settings.smartConnect || false;

    // 应用深色模式到设置页面
    applyDarkMode(settings.darkMode || false);

    // 更新所有开关状态
    updateToggleSwitch('nodeTypeSwitch', document.getElementById('showNodeType'));
    updateToggleSwitch('dualColumnSwitch', document.getElementById('dualColumn'));
    updateToggleSwitch('darkModeSwitch', document.getElementById('darkMode'));
    updateToggleSwitch('autoDeleteSwitch', document.getElementById('autoDelete'));
    updateToggleSwitch('autoSortSwitch', document.getElementById('autoSort'));
    updateToggleSwitch('smartConnectSwitch', document.getElementById('smartConnect'));

    // 生成同步说明 HTML
    updateSyncInfoBox();
  } catch (error) {
    console.error('加载设置失败:', error);
  }
}

// 更新同步说明框
function updateSyncInfoBox() {
  const syncInfoBox = document.getElementById('syncInfoBox');
  if (!syncInfoBox) return;

  syncInfoBox.innerHTML = `
    <strong>${t('syncExplanation', '同步说明：')}</strong>
    <div style="margin-top: 8px; line-height: 1.8;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="color: #48bb78; font-weight: 500;">✓</span>
        <span>${t('syncWillSync', '显示设置、开关状态、API配置会自动跨设备同步')}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="color: #e53e3e; font-weight: 500;">✗</span>
        <span>${t('syncLocalOnly', '订阅链接、收藏节点仅在本地存储（保护隐私）')}</span>
      </div>
    </div>
  `;
}

async function saveSettings() {
  // 设置保存标志，防止 storage onChange 重复加载
  isSavingSettings = true;

  let apiUrl = document.getElementById('apiUrl').value.trim();
  const apiSecret = document.getElementById('apiSecret').value.trim();

  // 处理关键词：去除前后空格，按逗号分割，去除每个关键词的前后空格，再重新组合
  let smartConnectKeywords = document.getElementById('smartConnectKeywords').value.trim();
  if (smartConnectKeywords) {
    const keywords = smartConnectKeywords.split(',').map(k => k.trim()).filter(k => k);
    smartConnectKeywords = keywords.join(', ');
    // 更新输入框显示，让用户看到处理后的结果
    document.getElementById('smartConnectKeywords').value = smartConnectKeywords;
  }

  const showNodeType = document.getElementById('showNodeType').checked;
  const dualColumn = document.getElementById('dualColumn').checked;
  const darkMode = document.getElementById('darkMode').checked;
  const autoDelete = document.getElementById('autoDelete').checked;
  const autoSort = document.getElementById('autoSort').checked;
  const smartConnect = document.getElementById('smartConnect').checked;

  // 获取并发测试数量
  let testConcurrency = parseInt(document.getElementById('testConcurrency').value) || 10;
  testConcurrency = Math.max(1, Math.min(50, testConcurrency));
  document.getElementById('testConcurrency').value = testConcurrency;

  // 获取测速目标地址
  const testUrl = document.getElementById('testUrl').value.trim();

  // 自动添加 http:// 前缀
  if (apiUrl && !apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
    apiUrl = 'http://' + apiUrl;
  }

  // 分离设置：只有 testUrl 存储在 local（因为可能很长）
  const localSettings = {
    ...(testUrl ? { testUrl } : {})  // 测速目标地址
  };

  const syncSettings = {
    ...(apiUrl ? { apiUrl } : {}),
    ...(apiSecret ? { apiSecret } : {}),
    showNodeType,
    dualColumn,
    darkMode,
    autoDelete,
    autoSort,
    smartConnect,
    smartConnectKeywords,
    testConcurrency,
    language: currentLang
  };

  // 同时保存到 local 和 sync（确保 local 总是最新的）
  await chrome.storage.local.set({ syncSettings });

  try {
    // 获取旧设置，判断智能连接配置是否变化
    const [syncResult, localResult] = await Promise.all([
      chrome.storage.sync.get(['syncSettings']),
      chrome.storage.local.get(['localSettings'])
    ]);
    const oldSyncSettings = syncResult.syncSettings || {};
    const oldLocalSettings = localResult.localSettings || {};

    const smartConnectChanged = oldSyncSettings.smartConnect !== syncSettings.smartConnect;
    const keywordsChanged = oldSyncSettings.smartConnectKeywords !== syncSettings.smartConnectKeywords;

    // 分别保存到 sync 和 local
    await Promise.all([
      chrome.storage.sync.set({ syncSettings }),
      chrome.storage.local.set({ localSettings })
    ]);

    // 合并设置用于通知 background.js
    const mergedSettings = { ...localSettings, ...syncSettings };

    // 通知 background.js 重新加载配置
    chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings: mergedSettings
    });

    // 如果智能连接配置发生变化，且智能连接已启用，则重新触发智能连接
    if ((smartConnectChanged || keywordsChanged) && syncSettings.smartConnect) {
      chrome.runtime.sendMessage({
        action: 'triggerSmartConnect'
      });
    }

    // 显示保存状态提示
    showSaveStatus();

    // 应用深色模式
    applyDarkMode(syncSettings.darkMode || false);
  } catch (error) {
    console.error('保存失败:', error);
  } finally {
    // 清除保存标志，允许后续的 storage onChange 触发重新加载
    isSavingSettings = false;
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

// 显示保存状态
function showSaveStatus() {
  showToast(t('settingsAutoSaved', '✓ 设置已自动保存'));
}

// 显示 Toast 提示
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  document.body.appendChild(toast);

  // 触发动画
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  // 自动移除
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 2000);
}

// 添加 Toast 样式
function addToastStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .toast-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 14px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      opacity: 0;
      transform: translateX(400px);
      transition: all 0.3s ease-out;
    }

    .toast-notification.show {
      opacity: 1;
      transform: translateX(0);
    }
  `;
  document.head.appendChild(style);
}

// 打开分组管理窗口
function openGroupManager() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('group-manager.html')
  });
}

// 清除所有数据 (GDPR 合规)
async function clearAllData() {
  const confirmed = confirm(t('confirmClearAllData1',
    '⚠️ 警告：此操作将清除所有数据！\n\n' +
    '将删除以下内容：\n' +
    '• 所有订阅链接\n' +
    '• API 配置\n' +
    '• 所有设置项\n' +
    `${t('trafficInfoInClear', '• 流量信息')}\n` +
    '• 节点收藏\n' +
    '• 测试状态\n\n' +
    '此操作不可撤销！确定要继续吗？'
  ));

  if (!confirmed) {
    return;
  }

  // 二次确认
  const doubleConfirmed = confirm(t('confirmClearAllData2', '请再次确认：真的要删除所有数据吗？'));
  if (!doubleConfirmed) {
    return;
  }

  try {
    // 清除 chrome.storage.local 中的所有数据
    await chrome.storage.local.clear();

    // 清除 chrome.storage.sync 中的所有数据
    await chrome.storage.sync.clear();

    showToast(t('allDataCleared', '✓ 所有数据已清除'));

    // 重新加载页面，恢复到初始状态
    setTimeout(() => {
      location.reload();
    }, 1000);
  } catch (error) {
    console.error('清除数据失败:', error);
    showToast(t('clearFailed', '清除失败，请重试'));
  }
}

// ==================== 自定义弹窗功能 ====================

// 显示弹窗
function showModal(options) {
  const modal = document.getElementById('customModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const modalFooter = document.getElementById('modalFooter');
  const modalClose = document.getElementById('modalClose');

  // 设置标题
  modalTitle.textContent = options.title || '提示';

  // 设置内容
  modalBody.innerHTML = options.content || '';

  // 设置按钮
  if (options.buttons) {
    modalFooter.innerHTML = options.buttons.map(btn =>
      `<button class="modal-btn ${btn.primary ? 'modal-btn-primary' : 'modal-btn-secondary'}" data-action="${btn.action}">
        ${btn.text}
      </button>`
    ).join('');

    // 绑定按钮事件
    modalFooter.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'cancel' || action === 'close') {
          closeModal();
          options.onCancel && options.onCancel();
        } else if (options.onConfirm) {
          options.onConfirm();
        }
      });
    });
  }

  // 绑定关闭按钮
  modalClose.onclick = () => {
    closeModal();
    options.onCancel && options.onCancel();
  };

  // 点击遮罩关闭
  modal.querySelector('.modal-overlay').onclick = (e) => {
    if (e.target === modal.querySelector('.modal-overlay')) {
      closeModal();
      options.onCancel && options.onCancel();
    }
  };

  // 显示弹窗
  modal.classList.add('active');
}

// 关闭弹窗
function closeModal() {
  const modal = document.getElementById('customModal');
  modal.classList.add('closing');

  // 等待动画完成后再隐藏弹窗
  setTimeout(() => {
    modal.classList.remove('active');
    modal.classList.remove('closing');
  }, 200);
}

// ==================== 加密/解密功能 ====================

// 混淆的加密密钥（32字节随机密钥）
const _0x1a2b = atob('eHl6QXpUdzlSbTRhNmY4b0NnRWwzVXlLdkoycG5RMnAwV0hNZVJMbG5xZm5zSTI1T0FuUQ==');
const _0x3c4d = (str) => str.split('').reverse().join('');
const _0x5e6f = _0x3c4d(_0x1a2b);

// 从密码生成密钥
async function deriveKey(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// 使用内置密钥加密数据
async function encryptData(data) {
  const password = _0x5e6f;
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encoder.encode(JSON.stringify(data))
  );

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

// 使用自定义密码加密数据
async function encryptDataWithPassword(data, password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encoder.encode(JSON.stringify(data))
  );

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

// 使用内置密钥解密数据
async function decryptData(encryptedBase64) {
  try {
    const password = _0x5e6f;
    const combined = new Uint8Array(
      atob(encryptedBase64).split('').map(c => c.charCodeAt(0))
    );

    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);

    const key = await deriveKey(password, salt);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encrypted
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  } catch (error) {
    throw new Error('builtin_key_failed');
  }
}

// 使用自定义密码解密数据
async function decryptDataWithPassword(encryptedBase64, password) {
  try {
    const combined = new Uint8Array(
      atob(encryptedBase64).split('').map(c => c.charCodeAt(0))
    );

    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);

    const key = await deriveKey(password, salt);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encrypted
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  } catch (error) {
    throw new Error('custom_key_failed');
  }
}

// 导出配置
async function exportConfig() {
  try {
    // 获取所有数据（包括 sync 和 local）
    const [syncResult, localResult, subscriptionsResult, favoriteResult, languageResult] = await Promise.all([
      chrome.storage.sync.get(['syncSettings']),
      chrome.storage.local.get(['localSettings']),
      chrome.storage.local.get(['subscriptions']),
      chrome.storage.local.get(['favoriteNodes']),
      chrome.storage.local.get(['language'])
    ]);

    const config = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      data: {
        // 显示设置（开关、布局等）
        syncSettings: syncResult.syncSettings || {},
        // 敏感数据（API密钥、订阅链接）
        localSettings: localResult.localSettings || {},
        // 订阅列表（包含完整URL）
        subscriptions: subscriptionsResult.subscriptions || [],
        // 收藏节点列表
        favoriteNodes: favoriteResult.favoriteNodes || [],
        // 语言设置
        language: languageResult.language || 'zh_CN'
      }
    };

    // 显示加密选项弹窗
    showModal({
      title: t('encryptChoiceTitle', '选择加密方式'),
      content: `
        <div class="modal-info">
          <span class="modal-info-icon">🔒</span>
          <div class="modal-info-text">
            <strong>${t('encryptChoiceTitle', '选择配置文件加密方式')}</strong>
          </div>
        </div>
        <div class="modal-option" id="optionDefault">
          <span class="modal-option-icon">🛡️</span>
          <div class="modal-option-content">
            <div class="modal-option-title">${t('encryptDefault', '默认加密（推荐）')}</div>
            <div class="modal-option-desc">${t('encryptDefaultDesc', '使用内置密钥加密，导入时无需输入密码')}</div>
          </div>
        </div>
        <div class="modal-option" id="optionCustom">
          <span class="modal-option-icon">🔐</span>
          <div class="modal-option-content">
            <div class="modal-option-title">${t('encryptCustom', '自定义密码加密')}</div>
            <div class="modal-option-desc">${t('encryptCustomDesc', '使用您自己的密码加密，导入时需要输入密码')}</div>
          </div>
        </div>
      `,
      buttons: [
        { text: '取消', action: 'cancel' },
        { text: '继续', action: 'confirm', primary: true }
      ],
      onConfirm: async () => {
        const optionDefault = document.getElementById('optionDefault');
        const optionCustom = document.getElementById('optionCustom');

        // 检查用户选择了哪个选项
        if (optionCustom && optionCustom.classList.contains('selected')) {
          // 自定义密码
          showPasswordModal(config);
        } else if (optionDefault && optionDefault.classList.contains('selected')) {
          // 默认加密
          const encrypted = await encryptData(config);
          downloadConfig(encrypted);
          closeModal();
          showToast('✓ 配置已加密导出');
        } else {
          showToast('⚠️ 请选择一个加密方式');
        }
      },
      onCancel: () => {}
    });

    // 绑定选项点击事件
    setTimeout(() => {
      document.getElementById('optionDefault').addEventListener('click', function() {
        document.querySelectorAll('.modal-option').forEach(opt => opt.classList.remove('selected'));
        this.classList.add('selected');
      });

      document.getElementById('optionCustom').addEventListener('click', function() {
        document.querySelectorAll('.modal-option').forEach(opt => opt.classList.remove('selected'));
        this.classList.add('selected');
      });
    }, 100);

  } catch (error) {
    console.error('导出失败:', error);
    showToast('❌ 导出失败，请重试');
  }
}

// 显示密码输入弹窗
function showPasswordModal(config) {
  showModal({
    title: t('customPassword', '设置自定义密码'),
    content: `
      <div class="modal-hint-text">
        ${t('passwordRequired', '请输入加密密码（至少6位字符）')}
      </div>
      <input type="password" id="modalPassword1" class="modal-input" placeholder="${t('passwordConfirm', '请输入密码')}">
      <input type="password" id="modalPassword2" class="modal-input" placeholder="${t('passwordConfirm', '请再次输入密码')}">
      <div id="passwordError" style="color: #ff4757; font-size: 13px; margin-top: 8px; display: none;"></div>
    `,
    buttons: [
      { text: t('cancel', '取消'), action: 'cancel' },
      { text: t('save', '确认导出'), action: 'confirm', primary: true }
    ],
    onConfirm: async () => {
      const password1 = document.getElementById('modalPassword1').value;
      const password2 = document.getElementById('modalPassword2').value;
      const errorDiv = document.getElementById('passwordError');

      // 验证密码
      if (!password1 || password1.length < 6) {
        errorDiv.textContent = t('passwordShort', '❌ 密码至少需要6位字符');
        errorDiv.style.display = 'block';
        return;
      }

      if (password1 !== password2) {
        errorDiv.textContent = t('passwordMismatch', '❌ 两次输入的密码不一致');
        errorDiv.style.display = 'block';
        return;
      }

      errorDiv.style.display = 'none';

      // 使用自定义密码加密
      try {
        const encrypted = await encryptDataWithPassword(config, password1);
        downloadConfig(encrypted);
        showToast(t('configExported', '✓ 配置已使用自定义密码加密导出'));
        closeModal();
      } catch (error) {
        errorDiv.textContent = '❌ ' + t('exportFailed', '加密失败，请重试');
        errorDiv.style.display = 'block';
      }
    }
  });

  // 绑定实时验证事件
  setTimeout(() => {
    const password1Input = document.getElementById('modalPassword1');
    const password2Input = document.getElementById('modalPassword2');
    const errorDiv = document.getElementById('passwordError');

    // 第一个密码框失焦时检查长度和一致性
    password1Input.addEventListener('blur', () => {
      const password1 = password1Input.value;
      const password2 = password2Input.value;

      // 检查第一个密码长度
      if (password1 && password1.length < 6) {
        errorDiv.textContent = t('passwordShort', '❌ 密码至少需要6位字符');
        errorDiv.style.display = 'block';
        return;
      }

      // 如果第二个密码框也有内容，检查是否一致
      if (password2 && password2.length >= 6 && password1 !== password2) {
        errorDiv.textContent = t('passwordMismatch', '❌ 两次输入的密码不一致');
        errorDiv.style.display = 'block';
      } else {
        errorDiv.style.display = 'none';
      }
    });

    // 第一个密码框输入时，如果第二个密码框已有内容，也实时检查
    password1Input.addEventListener('input', () => {
      const password1 = password1Input.value;
      const password2 = password2Input.value;

      // 只有当两个密码都>=6位时才检查是否相同
      if (password1 && password2 && password1.length >= 6 && password2.length >= 6) {
        if (password1 !== password2) {
          errorDiv.textContent = t('passwordMismatch', '❌ 两次输入的密码不一致');
          errorDiv.style.display = 'block';
        } else {
          errorDiv.style.display = 'none';
        }
      } else {
        errorDiv.style.display = 'none';
      }
    });

    // 第二个密码框失焦时检查
    password2Input.addEventListener('blur', () => {
      const password1 = password1Input.value;
      const password2 = password2Input.value;

      // 先检查第一个密码长度
      if (password1 && password1.length < 6) {
        errorDiv.textContent = t('passwordShort', '❌ 密码至少需要6位字符');
        errorDiv.style.display = 'block';
        return;
      }

      // 检查第二个密码长度
      if (password2 && password2.length < 6) {
        errorDiv.textContent = t('passwordShort', '❌ 密码至少需要6位字符');
        errorDiv.style.display = 'block';
        return;
      }

      // 两个密码都>=6位时，检查是否相同
      if (password1 && password2 && password1.length >= 6 && password2.length >= 6) {
        if (password1 !== password2) {
          errorDiv.textContent = t('passwordMismatch', '❌ 两次输入的密码不一致');
          errorDiv.style.display = 'block';
        } else {
          errorDiv.style.display = 'none';
        }
      } else {
        errorDiv.style.display = 'none';
      }
    });

    // 第二个密码框输入时实时检查是否相同
    password2Input.addEventListener('input', () => {
      const password1 = password1Input.value;
      const password2 = password2Input.value;

      // 只有当两个密码都>=6位时才检查是否相同
      if (password1 && password2 && password1.length >= 6 && password2.length >= 6) {
        if (password1 !== password2) {
          errorDiv.textContent = t('passwordMismatch', '❌ 两次输入的密码不一致');
          errorDiv.style.display = 'block';
        } else {
          errorDiv.style.display = 'none';
        }
      } else {
        errorDiv.style.display = 'none';
      }
    });
  }, 100);
}

// 下载配置文件
function downloadConfig(encrypted) {
  const fileName = `proxyhub-config-${new Date().toISOString().split('T')[0]}.json`;
  const blob = new Blob([encrypted], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 导入配置
async function importConfig(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  // 重置文件输入，以便可以重复导入同一个文件
  event.target.value = '';

  try {
    const text = await file.text();
    const encryptedData = text.trim();

    // 先尝试用内置密钥解密
    let config;
    try {
      config = await decryptData(encryptedData);
      showImportConfirmModal(config, false);
    } catch (error) {
      // 内置密钥失败，显示自定义密码输入弹窗
      showPasswordInputModal(encryptedData);
    }

  } catch (error) {
    console.error('导入失败:', error);
    showToast('❌ 导入失败，请检查文件格式');
  }
}

// 显示导入确认弹窗
function showImportConfirmModal(config, usedCustomPassword) {
  showModal({
    title: t('importConfirmTitle', '确认导入配置'),
    content: `
      <div class="modal-info">
        <span class="modal-info-icon">📋</span>
        <div class="modal-info-text">
          <strong>${t('importInfo', '配置文件信息')}</strong>
          ${t('exportInfo', '导出时间：{date} 版本：{ver}').replace('{date}', config.exportDate || '未知').replace('{ver}', config.version)}${usedCustomPassword ? '<br>' + t('customPasswordEncrypted', '🔐 自定义密码加密') : ''}
        </div>
      </div>
      <div style="color: #666; margin-bottom: 12px;">
        ${t('importConfirmContent', '此操作将覆盖现有配置：')}
      </div>
      <div style="padding-left: 16px; color: #555;">
        • ${config.data.subscriptions?.length || 0} ${t('subscriptions', '个订阅')}<br>
        • ${config.data.favoriteNodes?.length || 0} ${t('favoriteNodes', '个收藏节点')}<br>
        • ${t('displaySettingsList', '显示设置（深色模式、双列显示等）')}<br>
        • ${t('apiConfig', 'API 配置和密钥')}<br>
        • ${t('smartConnectKeywords', '智能连接关键词规则')}
      </div>
    `,
    buttons: [
      { text: t('cancel', '取消'), action: 'cancel' },
      { text: t('confirmImport', '确认导入'), action: 'confirm', primary: true }
    ],
    onConfirm: async () => {
      closeModal();
      await importConfigData(config);
    }
  });
}

// 显示密码输入弹窗（用于解密）
function showPasswordInputModal(encryptedData) {
  showModal({
    title: t('decryptPasswordRequired', '输入密码解密'),
    content: `
      <div class="modal-hint-text">
        ${t('decryptPasswordRequired', '此配置文件使用自定义密码加密，请输入密码')}
      </div>
      <input type="password" id="modalDecryptPassword" class="modal-input" placeholder="${t('decryptPasswordRequired', '请输入加密密码')}">
      <div id="decryptError" style="color: #ff4757; font-size: 13px; margin-top: 8px; display: none;"></div>
    `,
    buttons: [
      { text: t('cancel', '取消'), action: 'cancel' },
      { text: t('decrypt', '解密'), action: 'confirm', primary: true }
    ],
    onConfirm: async () => {
      const password = document.getElementById('modalDecryptPassword').value;
      const errorDiv = document.getElementById('decryptError');

      if (!password) {
        errorDiv.textContent = t('passwordShort', '❌ 请输入密码');
        errorDiv.style.display = 'block';
        return;
      }

      try {
        const config = await decryptDataWithPassword(encryptedData, password);

        // 验证配置格式
        if (!config.data || !config.version) {
          throw new Error(t('configFormatError', '格式错误'));
        }

        // 关闭当前弹窗，显示确认导入弹窗
        closeModal();
        setTimeout(() => {
          showImportConfirmModal(config, true);
        }, 300);

      } catch (error) {
        errorDiv.textContent = t('passwordWrong', '❌ 密码错误或文件已损坏');
        errorDiv.style.display = 'block';
      }
    }
  });
}

// 执行导入数据
async function importConfigData(config) {
  // 设置导入标志，防止 storage onChange 重复加载
  isImportingConfig = true;

  try {
    // 导入数据
    const updates = [];

    // 导入显示设置（syncSettings）- 同时保存到 sync 和 local
    if (config.data.syncSettings) {
      updates.push(chrome.storage.sync.set({ syncSettings: config.data.syncSettings }));
      updates.push(chrome.storage.local.set({ syncSettings: config.data.syncSettings }));
    }

    // 导入敏感数据（localSettings）
    if (config.data.localSettings) {
      updates.push(chrome.storage.local.set({ localSettings: config.data.localSettings }));
    }

    // 导入订阅列表
    if (config.data.subscriptions) {
      updates.push(chrome.storage.local.set({ subscriptions: config.data.subscriptions }));
    }

    // 导入收藏节点
    if (config.data.favoriteNodes) {
      updates.push(chrome.storage.local.set({ favoriteNodes: config.data.favoriteNodes }));
    }

    // 导入语言设置
    if (config.data.language) {
      updates.push(chrome.storage.local.set({ language: config.data.language }));
    }

    await Promise.all(updates);

    // 重新加载设置和订阅
    await loadSettings();
    await loadSubscriptions();

    // 通知 background.js 更新
    chrome.runtime.sendMessage({
      action: 'updateSettings'
    });

    showToast(t('configImported', '✓ 配置已导入'));
  } catch (error) {
    console.error('导入数据失败:', error);
    showToast('❌ 导入失败');
  } finally {
    // 清除导入标志，允许后续的 storage onChange 触发重新加载
    isImportingConfig = false;
  }
}

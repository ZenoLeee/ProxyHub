# ProxyHub - 节点管理工具

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-orange.svg)
![Chrome](https://img.shields.io/badge/Chrome-Extension-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

**高效的节点管理工具**

[功能特性](#-功能特性) • [快速开始](#-快速开始) • [使用指南](#-使用指南) • [隐私政策](#-隐私政策)

</div>

## ✨ 功能特性

### 🎯 核心功能
- ✅ **一键测速** - 快速测试所有节点延迟，找出最优节点
- ✅ **智能切换** - 自动选择延迟最低的节点，保持最佳连接速度
- ✅ **节点收藏** - 收藏常用节点，快速访问
- ✅ **自动排序** - 按延迟自动排序节点，优先显示低延迟节点
- ✅ **双列显示** - 支持双列布局，充分利用屏幕空间
- ✅ **深色模式** - 护眼深色主题，长时间使用更舒适

### 📊 订阅管理
- ✅ **多订阅支持** - 管理多个订阅链接，聚合流量信息
- ✅ **流量监控** - 实时显示已用流量、剩余流量、到期时间
- ✅ **敏感数据保护** - 默认隐藏订阅链接中的 token/key
- ✅ **配置导入导出** - 支持导出配置为 JSON 文件，方便备份

### 🔐 隐私与安全
- ✅ **本地存储** - 所有数据存储在本地，不上传到云端
- ✅ **云同步** - 设置自动跨设备同步（敏感数据除外）
- ✅ **彻底清除** - 一键清除所有数据，符合 GDPR 要求
- ✅ **最小权限** - 仅申请必要的浏览器权限

## 🚀 快速开始

### 系统要求

- **浏览器**：Chrome 88+ 或其他 Chromium 浏览器
- **代理客户端**：当前支持 Clash API 的代理工具（如 Clash Verge Rev、Clash for Windows、ClashX、Sing-box 等）
  > 💡 未来计划支持更多客户端（如 V2Ray、Xray 等）

### 安装步骤

#### 方法一：Chrome Web Store（推荐）

1. 访问 [Chrome Web Store](https://chrome.google.com/webstore/detail/proxyhub)
2. 点击"添加至 Chrome"
3. 确认权限请求
4. 安装完成！

#### 方法二：开发者模式安装

1. 下载最新版本的 [ProxyHub.zip](https://github.com/yourusername/proxyhub/releases)
2. 解压缩到任意目录
3. 打开 Chrome，访问 `chrome://extensions/`
4. 开启右上角的"开发者模式"
5. 点击"加载已解压的扩展程序"
6. 选择解压后的 ProxyHub 文件夹

### 代理客户端配置

#### 1. 配置代理 API

打开代理客户端设置，找到"外部控制"或"API"配置：

```yaml
external-controller: 127.0.0.1:9999  # 或你喜欢的端口
secret: your-secret-key               # 可选：设置密钥增强安全性
```

#### 2. 添加订阅

在代理客户端中：
1. 点击左侧"订阅"或"Profiles"
2. 粘贴订阅链接
3. 点击"Download"或"更新"

#### 3. 配置 ProxyHub

1. 点击扩展图标打开界面
2. 点击右上角"⚙️ 设置"
3. 填写代理 API 地址和密钥
4. 点击"添加订阅"添加订阅链接（可选）
5. 保存配置

## 📖 使用指南

### 1. 节点管理

#### 更新节点列表
点击界面顶部的"🔄 更新节点"按钮，扩展会从代理客户端读取所有可用节点。

#### 测试节点延迟
点击"⚡ 测试所有节点"按钮，扩展会批量测试所有节点延迟：
- 🟢 绿色：< 100ms（快速）
- 🟡 黄色：100-300ms（中等）
- 🔴 红色：> 300ms（慢速）
- ⚪ 灰色：测试失败

#### 切换节点
点击节点列表中的任意节点即可切换。当前连接的节点会高亮显示。

#### 收藏节点
右键点击节点，选择"⭐ 收藏"即可收藏常用节点。收藏的节点会显示星标。

### 2. 智能连接

启用智能连接后，扩展会：
1. 自动测试所有节点延迟
2. 选择延迟最低的节点
3. 每5分钟自动检测并切换到更快的节点

**设置方法**：
1. 打开设置页面
2. 找到"智能连接"
3. 开启该功能
4. （可选）设置关键词过滤节点（如"香港, HK, Hong Kong"）

### 3. 模式切换

支持快速切换代理模式（根据客户端支持情况）：
- **Global** - 全局代理
- **Rule** - 规则模式
- **Direct** - 直连模式

### 4. 订阅管理

#### 查看流量信息
在设置页面的"订阅管理"部分，可以看到：
- 已用流量
- 剩余流量
- 总流量
- 到期时间

#### 添加订阅
1. 点击"+ 添加订阅"
2. 填写订阅名称
3. 粘贴订阅链接
4. 点击"保存"

#### 导入/导出配置
- **导出**：点击"📤 导出配置"，将配置保存为 JSON 文件
- **导入**：点击"📥 导入配置"，从备份文件恢复配置

## 🛠️ 技术细节

### 权限说明

ProxyHub 需要以下权限：

| 权限 | 用途 |
|------|------|
| `storage` | 保存设置、订阅、收藏等数据 |
| `http://127.0.0.1/*` | 访问本地代理 API |
| `http://localhost/*` | 访问本地代理 API |
| `http://*/*` | 访问 HTTP 订阅链接（获取流量信息） |
| `https://*/*` | 访问 HTTPS 订阅链接（获取流量信息） |

### 数据存储

所有数据存储在您的本地设备中：

**本地存储（chrome.storage.local）**：
- 订阅链接和 API 密钥（敏感数据）
- 节点收藏列表
- 流量信息

**云同步（chrome.storage.sync）**：
- 显示设置（深色模式、双列显示等）
- 开关状态（智能连接、自动排序等）

### API 端点

ProxyHub 通过以下端点与代理客户端通信：

```
GET  /proxies              # 获取所有代理
GET  /proxies/GLOBAL       # 获取 GLOBAL 组信息
PUT  /proxies/GLOBAL       # 切换节点
GET  /configs              # 获取配置
PATCH /configs             # 修改配置（切换模式）
GET  /proxies/{name}/delay # 测试延迟
```

## 📁 项目结构

```
ProxyHub/
├── manifest.json          # 扩展配置文件
├── popup.html             # 主弹窗界面
├── settings.html          # 设置页面
├── privacy.html           # 隐私政策
├── css/
│   └── popup.css          # 样式文件
├── js/
│   ├── popup.js           # 主界面逻辑
│   ├── settings.js        # 设置页面逻辑
│   └── background.js      # 后台服务
├── icons/                 # 图标资源
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              # 项目文档
```

## 🐛 常见问题

### Q: 点击"更新节点"后没反应？
**A:**
1. 检查代理客户端是否正在运行
2. 检查 API 地址和密钥是否正确
3. 打开浏览器控制台（F12）查看错误信息

### Q: 测试节点失败？
**A:**
1. 确保代理客户端 API 可访问
2. 在浏览器访问 API 地址测试（如 `http://127.0.0.1:9999/proxies`）
3. 检查代理客户端日志

### Q: 无法获取流量信息？
**A:**
1. 确保已添加订阅链接
2. 检查订阅链接是否正确
3. 查看控制台是否有 CORS 错误

### Q: 智能连接选择了错误的节点？
**A:**
1. 检查是否设置了关键词过滤
2. 查看控制台日志了解选择过程
3. 可以手动切换节点

### Q: 如何完全卸载？
**A:**
1. 打开 `chrome://extensions/`
2. 找到 ProxyHub
3. 点击"移除"
4. （可选）在设置页面点击"🗑️ 彻底重置所有数据"

### Q: 支持哪些代理客户端？
**A:** 当前支持所有提供 Clash API 的代理客户端，包括：
- Clash Verge Rev
- Clash for Windows
- ClashX (macOS)
- Sing-box（兼容 Clash API）
- Stash（兼容 Clash API）

> 💡 未来计划：V2Ray、Xray 等客户端的支持正在开发中

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

## 🔐 隐私政策

ProxyHub 非常重视您的隐私。详细内容请查看：[隐私政策](privacy.html)

**核心承诺**：
- ✅ 所有数据存储在本地
- ✅ 不收集个人数据
- ✅ 不向第三方传输数据
- ✅ 您可以随时导出或清除数据

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 如何贡献
1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📧 联系方式

- **GitHub Issues**: [提交问题](https://github.com/zenoleee/ProxyHub/issues)
- **Email**: [zeno5404@gmail.com](mailto:zeno5404@gmail.com)

## ☕ 赞助支持

如果您觉得这个项目对您有帮助，欢迎请我喝杯咖啡☕️您的支持是我持续开发的动力！

![微信支付](https://github.com/ZenoLeee/zeno/raw/main/images/sponsor/wechat.jpg)
![支付宝](https://github.com/ZenoLeee/zeno/raw/main/images/sponsor/alipay.jpg)

感谢所有赞助者的支持！🙏

---

⭐ 如果这个项目对你有帮助，请给个 Star 支持一下！

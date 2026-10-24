# dsh-share 0.4.1

[English](README.en.md) · [下载 v0.4.1](https://github.com/RestartBaiYe/dsh-share/releases/tag/v0.4.1) · [反馈问题](https://github.com/RestartBaiYe/dsh-share/issues)

将 DeepSeek Harness 对话生成可独立阅读的只读网页。新增 **BrewPage 限时分享**：不用注册额外账号，可选 **1 天 / 3 天 / 7 天 / 30 天**，发布成功后可关闭 DSH 或电脑。

## 使用

1. 打开一段 DSH 对话，点击标题栏「分享」。
2. 先通过「本机链接」预览内容，确认可公开分享。
3. 在「BrewPage 分享有效期」中选择 1、3、7 或 30 天，默认 7 天。
4. 点击 **「使用 BrewPage 限时分享」**，只把快照上传至 brewpage.app。
5. 弹窗显示分享链接和服务端返回的到期时间。复制链接发送即可，对方无需账号，DSH 无需保持运行。
6. 回到原对话的分享弹窗可恢复链接或提前撤销。撤销失败时保留管理凭据，便于重试。

已有链接的有效期不会因再次点击而续期。若要变更时长，先撤销再重新分享；已到期的记录可重新选择时长并发布。服务端执行有效期，不依赖本机定时器。有效期无法收回接收者已保存的副本。

## 验证状态

- BrewPage 已完成真实公网测试：选择 1 天、服务端返回匹配的到期时间、发布子进程退出后页面读取 **200** 且内容匹配、撤销后读取 **404**。
- 没有等待满 1 天验证自然过期；已核对官方 TTL 接口、实际请求和服务返回的 expiresAt。1 / 3 / 7 / 30 天均有接口及界面测试。
- 本地测试还覆盖不自动转传、同一快照复用不续期、修改有效期需先撤销、管理凭据过滤、撤销失败保留凭据、进程中断后的凭据恢复。
- DSH Share / HTML Hoster 旧通道保留。它们此前在本机分别遇到 Cloudflare 拦截、DNS 失败，不会在 BrewPage 失败后被自动调用。
- 本次公网测试仅使用程序生成的文字，未使用真实聊天记录。

## 安装

**Desktop：**在 DSH 的「添加插件」中粘贴：

```text
github:RestartBaiYe/dsh-share#v0.4.1
```

**Web：**使用正常的 DSH 插件管理器安装：

```powershell
dsh plugin --profile web add 'github:RestartBaiYe/dsh-share#v0.4.1'
```

也可在 [Releases](https://github.com/RestartBaiYe/dsh-share/releases/latest) 下载 `.tgz`，将下载地址交给插件管理器。插件没有 npm 安装脚本或构建步骤。

下面的本地安装器供需要手动链接源码的用户使用：

已有 DSH Desktop profile 的用户双击 `install-desktop.cmd`，或运行：

```powershell
node install.mjs --profile desktop
# Web profile
node install.mjs --profile web
```

支持 `DSH_HOME` / `DSH_PROFILE_DIR`。安装器不修改 app.asar，不删除原插件目录；旧插件和 profile 配置备份至 `<profile>/.dsh-share-backup/<时间>/`。安装后刷新 DSH 页面，必要时重启。

也可以通过 DSH 的插件管理安装本目录生成的 `dsh-share-0.4.1.tgz`。

## 配置

```yaml
- id: dsh-share
  config:
    brewpageEnabled: true        # 显示 BrewPage 按钮；有效期在分享时选择
    relayUrl: ""                # 可选：填写自行部署的中转地址
    publishProvider: auto
    htmlhosterEnabled: true      # 独立按钮，不参与默认流程
    ttlDays: 0                  # 原通道和本机快照的默认有效期
    publicTunnel: false
    redactPaths: true
    includeReasoning: false
    includeTools: false
    maxMessages: 1000
```

插件不再内置任何个人账号或个人中转域名。未配置 `relayUrl` 时，中转按钮隐藏且请求被拒绝，不会回退上传至其他服务。BrewPage 和 HTML Hoster 仍需手动选择。`publishProvider: none` 禁用所有上传。`brewpageEnabled: false` 隐藏并禁用 BrewPage。BrewPage 本次选取的期限传给其服务端，原 `ttlDays` 配置不替代这项选择。配置了 `ttlDays > 0` 时 HTML Hoster 被禁用，因为该服务未提供可验证的自动到期机制。

## 分享与隐私

- 快照不会自动跟随新消息更新；只有点击具体服务的按钮才上传，也不会自动转传给另一家。
- BrewPage 使用每次随机生成的非 public 命名空间，避免进入其公开列表和站点地图；链接持有者仍可直接阅读。
- 默认不分享思考、工具输出、系统提示和内部会话 ID；标题和正文中的本地路径、用户名、IP 默认脱敏。自动脱敏不能识别所有秘密，应先预览。
- BrewPage 服务器返回的主分享链接原样使用；不会从内部 ID 猜测子域名。管理凭据只发给固定的 apex 删除接口，不发给内容子域名。
- 管理凭据保存在 `$DSH_HOME/shares/index.json` 或 `pending-publications/` 恢复日志中，不返回给公开页面或分享列表；删除本机全部分享数据后无法恢复它们。
- 撤销会检查公开地址返回 404 / 410，未确认删除时保留凭据。第三方可能添加其标识，存储及可达性受其运营和网络限制影响。
- 「导出网页对话」仍可生成自包含 HTML 文件，直接发送并离线阅读。

BrewPage 官方文档：https://brewpage.app/llms-full.txt 。仅参考官方 HTTP 协议，未安装任何远程技能或脚本。

## 开发验证

```powershell
npm test
npm run test:cloud
# 真实公网测试，仅上传程序生成的演示文字，结束时撤销
node smoke-cloud.mjs --provider brewpage --ttl-days 1
```

`cloud/` 是原 DSH Share 服务，`relay/server.mjs` 是可自行部署的 Node 中转。BrewPage 接入不需要部署它们、不需要账号或用户自有服务器。

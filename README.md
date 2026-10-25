# dsh-share 0.5.0

[English](README.en.md) · [下载安装包](https://github.com/RestartBaiYe/dsh-share/releases/latest) · [反馈问题](https://github.com/RestartBaiYe/dsh-share/issues)

把 DeepSeek Harness 对话分享成可独立阅读的网页。无需额外注册账号；使用 **BrewPage** 可选 **1 / 3 / 7 / 30 天**，发布成功后可以关闭 DSH 或电脑。

## v0.5.0

- **先预览，再分享**：直接在窗口中查看脱敏后的文字；勾选消息、只选最后一轮、修改标题。保存选择后生成新的快照，原链接不会改变。
- **找回旧链接**：同一对话的历史快照集中显示，可打开、复制或撤销。新增消息后仍能管理以前发布的链接。
- **更可靠的撤销**：发布过程中撤销会等待上传结果；撤销时阻止新的上传。未确认删除时保留记录和删除凭据。
- **更多隐私保护**：默认处理路径大小写、分隔符和转义形式，并脱敏可识别的访问令牌、私钥和密码字段。新快照使用 128 位随机标识。
- **离线导出**：选好的内容可以导出自包含 HTML 或 Markdown。手机布局、深色模式及键盘操作已检查。
- **发布检查**：CI 会审计真正的 npm 安装包，阻止个人托管域名、部署 ID、硬编码凭据、账号路径和意外文件进入发行版。

## 安装

DSH Desktop 的「添加插件」中输入：

```text
github:RestartBaiYe/dsh-share#v0.5.0
```

Web profile：

```sh
dsh plugin --profile web add 'github:RestartBaiYe/dsh-share#v0.5.0'
```

也可以使用 [发行版](https://github.com/RestartBaiYe/dsh-share/releases/latest) 的 `.tgz`。没有运行时依赖、npm 安装脚本或构建步骤；需要 Node.js 22.13+。安装或升级后刷新页面，必要时重启 DSH。旧版本的快照和删除凭据可继续使用。

需要手动安装源码时运行 `node install.mjs --profile desktop`，或双击 `install-desktop.cmd`；Web 使用 `--profile web`。支持 `DSH_HOME` / `DSH_PROFILE_DIR`。安装器会备份旧插件与 profile 配置，不修改 app.asar，不改写用户的 `cordis.patch.yml`。

## 使用

1. 打开对话，点击标题栏的「分享」。此时仅创建本机快照，不会上传。
2. 展开消息检查内容。可以改标题、取消勾选，或点击「仅最后一轮」。
3. 有修改时，点击「保存选择并预览」，确认新快照内容。
4. 选择有效期，再点击「使用 BrewPage 限时分享」。成功后显示服务端返回的链接和到期时间。
5. 需要找回或撤销旧链接时，在「分享记录」中选择对应快照。

已发布链接不会跟随对话更新。再次发布同一有效快照会复用原链接，不延长时效；要修改期限或切换服务，先撤销原链接。修改内容会生成另一份快照，旧链接仍在历史列表中。

「导出网页对话」和「导出 Markdown」只下载本机文件。HTML 内含搜索、目录和深色模式，可离线阅读。云端到期或撤销无法收回已下载的副本。

## 托管服务

| 通道 | 需要额外账号 | 有效期 | DSH 关闭后 |
|---|---|---|---|
| BrewPage | 不需要 | 分享时选 1 / 3 / 7 / 30 天 | 可访问至到期或撤销 |
| HTML Hoster | 不需要 | 不保证自动到期；可尝试提前撤销 | 取决于服务保存状态 |
| 自有中转 | 自行部署 | 使用 `ttlDays` | 取决于中转服务 |
| 临时公网隧道 | 不需要 | DSH 运行期间 | 不可访问；默认关闭 |

每个服务必须手动选择。失败不会自动把内容上传到另一家。BrewPage 使用随机的非公开列出命名空间；持有链接的人仍可以阅读。第三方可能添加其页面标识，可达性、额度和保存期限受服务运营影响。

HTML Hoster 此前在测试网络遇到 DNS 失败，保留为可选通道。插件没有内置个人中转地址；未配置中转时，相应按钮隐藏，直接请求也会被拒绝。

## 配置

```yaml
- id: dsh-share
  config:
    brewpageEnabled: true
    htmlhosterEnabled: true
    relayUrl: ""                 # 可选：自行部署的中转
    publishProvider: auto        # none 禁止所有上传
    ttlDays: 0                   # 本机快照与自有中转；不替代 BrewPage 的选择
    publicTunnel: false
    redactPaths: true
    redactSecrets: true
    includeReasoning: false
    includeTools: false
    maxMessages: 1000            # 取最近的消息；预览会提示截断
```

`brewpageEnabled: false` 可单独关闭 BrewPage。`ttlDays > 0` 时禁用 HTML Hoster，因为其没有可验证的自动到期保证。仅设置必要选项即可；界面的管理路径固定为 `/share`。

## 隐私与恢复

- 默认不包含思考、工具输出、系统提示或内部会话 ID。自动脱敏不能识别所有秘密，预览是最终检查依据。
- 对话必须主动发布才会交给所选第三方；这不属于端到端加密分享。不要用公开链接传递未经允许公开的内容。
- 删除凭据保存在 `$DSH_HOME/shares/index.json` 与 `pending-publications/` 中，不出现在公开页面、预览 API 或列表响应里。请保留该目录，不要上传到仓库。
- 索引或恢复日志损坏时，插件会停止写入，避免覆盖原记录；请先备份并修复存储。远端删除失败时可以稍后重试。旧 Gist / Neocities / 不支持自动撤销的记录不会因删除失败而被清空。
- 管理接口受宿主校验保护；没有宿主校验服务时，仅接受本机来源和同源请求。令牌只发送到对应服务的管理接口。
- 同一个分享目录应由一个 DSH 进程管理；同进程的存储实例会串行写入索引。

## 验证

```sh
npm test
npm run test:cloud
npm run verify:package
# 显式公网验证，仅使用合成文字，并在结束时撤销
node smoke-cloud.mjs --provider brewpage --ttl-days 1
```

2026-10-25：21 项插件回归测试、2 项云端示例测试通过；真实浏览器完成桌面、手机深色模式、消息筛选、脱敏、发布、撤销和 Escape 操作检查。BrewPage 公网测试确认 1 天的服务端到期时间、发布子进程退出后读取 200、撤销后读取 404；没有等待满 1 天验证自然到期。

`cloud/` 与 `relay/` 是可选自部署示例，不是 BrewPage 的依赖。中转验证使用 `DSH_SHARE_RELAY_URL` 环境变量。兼容性基于当前宿主服务接口与本机 Desktop profile 验证，未声称覆盖每个 DSH 版本。

[变更记录](CHANGELOG.md) · [BrewPage 官方 API](https://brewpage.app/llms-full.txt) · MIT。社区插件，非 DeepSeek 官方产品。

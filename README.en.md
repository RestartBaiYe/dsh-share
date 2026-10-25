# dsh-share 0.5.0

[中文](README.md) · [Latest release](https://github.com/RestartBaiYe/dsh-share/releases/latest)

Share a DeepSeek Harness conversation as a read-only web page. **BrewPage** needs no extra account and offers **1 / 3 / 7 / 30 days** of retention. Readers can open a published link after DSH and the author's computer shut down.

## Install

Paste into DSH Desktop's **Add plugin**:

```text
github:RestartBaiYe/dsh-share#v0.5.0
```

For a web profile:

```sh
dsh plugin --profile web add 'github:RestartBaiYe/dsh-share#v0.5.0'
```

A prebuilt `.tgz` is available in [Releases](https://github.com/RestartBaiYe/dsh-share/releases/latest). No runtime dependencies, npm lifecycle scripts or build step. Node.js 22.13+ is required. Reload/restart DSH after upgrading. Existing snapshots and revocation keys remain compatible.

The optional source installer is `node install.mjs --profile desktop` (`--profile web` for web). It supports `DSH_HOME` and `DSH_PROFILE_DIR`, backs up the previous installation and preserves unrelated profile settings and the user's Cordis patch.

## Review, select and share

1. Click **Share** in a conversation. Creating this local snapshot does not upload it.
2. Review the saved, redacted text. Edit the title, select individual messages or choose **Last turn only**.
3. If you changed anything, click **Save selection & review**. This creates another immutable snapshot; old links are unchanged.
4. Choose a lifetime, then explicitly click **Share with BrewPage (expires)**. The dialog shows the returned link and server expiry.
5. Use **Share history** to recover or revoke earlier links, even after adding messages to the conversation.

A live publication is reused without extending its lifetime. Revoke before changing retention or switching providers. Export the reviewed snapshot as a self-contained HTML file or Markdown without any upload; HTML includes offline search, a contents panel and dark mode.

## Hosting and privacy

- Each host requires its own explicit action. There is no automatic upload fallback.
- BrewPage uses a fresh unlisted namespace. Anyone with the link can read it; this is not end-to-end encrypted sharing. Availability, quotas and retention depend on the provider.
- HTML Hoster is an optional manual channel without guaranteed automatic expiry or permanent storage. It previously failed DNS resolution in the test network.
- No personal relay address is built in. A relay needs your own `relayUrl`; missing configuration hides its button and rejects uploads. Temporary tunnels are disabled by default and require DSH to stay running.
- Reasoning, tools, system prompts and internal session IDs are excluded by default. Local paths and identities, recognised access tokens, private keys and credential fields are scrubbed before persistence. Automatic redaction is incomplete; always review the preview.
- Revocation credentials stay in `$DSH_HOME/shares/`, separate from public pages and management listing/preview responses. Keep that directory to retain deletion access.
- Revocation waits for an ongoing upload and blocks overlapping new uploads. Failed deletions preserve the record. Corrupt indexes or journals stop writes instead of being replaced by empty data. Use one DSH process per share directory.
- Expiry or revocation cannot erase downloaded copies. An interrupted network response can leave the outcome uncertain; uploads are not automatically retried.

## Configuration

```yaml
- id: dsh-share
  config:
    brewpageEnabled: true
    htmlhosterEnabled: true
    relayUrl: ""
    publishProvider: auto
    ttlDays: 0
    publicTunnel: false
    redactPaths: true
    redactSecrets: true
    includeReasoning: false
    includeTools: false
    maxMessages: 1000
```

`publishProvider: none` disables all uploads. BrewPage retention is chosen in the dialog; `ttlDays` instead controls local snapshots and the relay. A positive `ttlDays` disables HTML Hoster. The client management path is `/share`.

## Verification

```sh
npm test
npm run test:cloud
npm run verify:package
# Optional live synthetic test, with cleanup
node smoke-cloud.mjs --provider brewpage --ttl-days 1
```

On 2026-10-25: 21 plugin regression tests and 2 cloud-example tests passed. A real-browser test covered desktop, mobile dark mode, content selection, redaction, publishing, revocation and Escape. The live BrewPage test confirmed one-day server expiry, HTTP 200 after the publishing child exited and HTTP 404 after revocation. Natural expiry was not waited out.

CI tests Node 22/24 on Linux/Windows and audits the actual package for unexpected files, personal hostnames, deployment identities, hardcoded credentials and account paths. `cloud/` and `relay/` are optional self-hosted examples, not requirements for BrewPage. Live relay tests use `DSH_SHARE_RELAY_URL`. Compatibility is tested against the host service contract and the local Desktop profile, not every DSH version.

[Changelog](CHANGELOG.md) · [BrewPage API](https://brewpage.app/llms-full.txt) · MIT. Community plugin; not an official DeepSeek product.

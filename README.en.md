# dsh-share

[中文](README.md) · [Release v0.4.1](https://github.com/RestartBaiYe/dsh-share/releases/tag/v0.4.1)

Share a DeepSeek Harness conversation as a read-only web snapshot. The BrewPage option needs no additional account and offers **1, 3, 7 or 30 days** of server-enforced retention. Once publishing succeeds, DSH and the author's computer can shut down.

## Install

In DSH Desktop, paste this into **Add plugin**, then reload/restart:

```text
github:RestartBaiYe/dsh-share#v0.4.1
```

For a web profile:

```sh
dsh plugin --profile web add 'github:RestartBaiYe/dsh-share#v0.4.1'
```

The prebuilt `.tgz` is also available in the GitHub release. There are no runtime dependencies, npm lifecycle install scripts or build requirements. Node.js 22.13+ is required. DSH is evolving quickly; compatibility has been exercised with the author's local Desktop profile, not every DSH version.

## Share

1. Open a conversation and click **Share** in its header.
2. Inspect the local snapshot before publishing.
3. Select **1 / 3 / 7 / 30 days** and click **Share with BrewPage (expires)**.
4. Copy the returned URL. Anyone holding it can read without signing in.
5. Reopen the same dialog to recover the link or revoke it early.

Reusing a live share preserves its original expiry. To change its lifetime, revoke it and publish again. The expiration shown in the dialog comes from the hosting service, rather than a timer on your computer.

Each hosting service has its own labelled action; failures never silently upload to another provider. No personal relay address or hosting account is built in. The optional DSH Share action requires your own `relayUrl`; without it the action is hidden and requests fail without contacting another host. HTML Hoster remains a separate manual action. Use `brewpageEnabled: false` to disable BrewPage, or `publishProvider: none` to disable publishing altogether.

## Privacy and limits

Snapshots are immutable views of the current messages. Later conversation turns are not automatically published. Reasoning, tools and runtime context are excluded by default. Local paths, user/host names and IP addresses are redacted in titles and messages; review the preview because this cannot detect every secret.

BrewPage receives the snapshot only after its own button is clicked. Each upload uses a random unlisted namespace, not the public gallery. This does not make the URL access-controlled: anyone with it can read. The provider may append its attribution badge. Its availability, retention and operational limits apply; expiry/revocation cannot erase recipients' downloaded copies.

Management tokens stay under `$DSH_HOME/shares/`, separate from public pages and API listing responses. A publication journal recovers received deletion credentials after an interrupted local index write. Keep that directory to retain early-revocation access.

## Verification

```sh
npm test
npm run test:cloud
```

The live synthetic BrewPage smoke test verified publishing with a matching one-day expiry, reading **HTTP 200 after the publishing child exited**, and **HTTP 404 after revocation**. It did not wait a full day to observe natural expiry. To repeat it explicitly:

```sh
node smoke-cloud.mjs --provider brewpage --ttl-days 1
```

`cloud/` and `relay/` contain optional self-hosted implementations; they are not required for BrewPage. The cloud manifest is an unbound example and contains no deployed project identity.

## License

MIT. This is a community plugin, not an official DeepSeek product. Hosting API: [BrewPage reference](https://brewpage.app/llms-full.txt).

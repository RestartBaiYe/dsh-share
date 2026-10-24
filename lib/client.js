/**
 * dsh-share — browser half.
 *
 * One Share entry in the conversation session header
 * (`conversation.session.header.utilities`): a click archives the current
 * conversation as a snapshot and shows the link with copy, open and revoke
 * actions, plus an optional public link served through the Host's own tunnel.
 * Only `react` is required; every style is injected once under a plugin tag.
 */
window.__ModuleLoader__.load({
	id: "dsh-share",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		const SLOT = "conversation.session.header.utilities";
		const PREFIX = "/share";
		const TAG_ID = "dsh-share/client.css";

		const zh = {
			share: "分享",
			creating: "生成中…",
			title: "分享此对话",
			hint: "先用本机链接预览，再选择托管服务。快照只上传到你点击的服务，拿到链接即可免登录阅读，关闭 DSH 后仍可查看。",
			copy: "复制链接",
			copied: "已复制",
			open: "打开",
			revoke: "撤销分享",
			revoked: "已撤销",
			close: "关闭",
			reuse: "这个会话已有一份最新快照，链接不变。",
			failed: "生成分享链接失败",
			empty: "这个会话还没有可以分享的内容。",
			forbidden: "当前浏览器未通过校验，请从 DSH 页面重新操作。",
			publicLink: "生成公网链接",
			publicHint: "公网链接只把这一页放到隧道后面：你的 IP、端口、主机名都不会出现在链接里，DSH 界面本身也不对外。",
			localHint: "这份快照只在本机可读：宿主没有开启公网分享。",
			publicDisabled: "公网分享未开启",
			publicReady: "公网链接已开启，已复制到剪贴板。任何人拿到它都能查看（只暴露这一页快照）。",
			exportFile: "导出网页对话",
			permanentLink: "生成分享链接",
			htmlhosterLink: "使用 HTML Hoster 分享",
			htmlhosterHint: "网页将公开托管于 htmlhoster.com；无需账号，每个网络出口每天限量上传，第三方可能添加页面组件，不保证永久保存。",
			brewpageLink: "使用 BrewPage 限时分享",
			brewpageHint: "快照托管至 brewpage.app，使用不公开列出的地址；无需账号，到期由服务端限制访问，也可提前撤销。",
			ttlLabel: "BrewPage 分享有效期",
			expiresLabel: "到期时间",
			expired: "此前的分享已到期，可以重新选择有效期并生成链接。",
			days: "天",
			permanentNote: "分享链接（关闭 DSH 后仍可查看）",
			permanentHint: "快照独立托管，无需注册新账号。默认不设到期日，可在此撤销；受服务可用性和存储额度限制，重要对话请保留导出文件。",
			permanentBusy: "上传中…",
			permanentFailed: "生成分享链接失败",
			permanentReady: "分享链接已生成，可以关闭 DSH。",
			tunnelReady: "链接已生成并复制。只要你开着 DSH，别人就能打开；关机后链接失效。",
			tunnelNote: "公网链接（DSH 运行期间可用）",
			publicBusy: "已开启公网",
			preparing: "准备隧道组件",
			connecting: "建立隧道…",
			publicFailed: "公网隧道启动失败",
			localNote: "本机链接",
			publicNote: "公网链接",
		};
		const en = {
			share: "Share",
			creating: "Creating…",
			title: "Share this conversation",
			hint: "Preview locally, then choose a host. Only the selected service receives this snapshot. Readers need no login and DSH can shut down.",
			copy: "Copy link",
			copied: "Copied",
			open: "Open",
			revoke: "Revoke",
			revoked: "Revoked",
			close: "Close",
			reuse: "This conversation already has an up-to-date snapshot; the link is unchanged.",
			failed: "Could not create a share link",
			empty: "This conversation has nothing to share yet.",
			forbidden: "This browser failed the trust check; retry from the DSH page.",
			publicLink: "Create public link",
			publicHint: "A public link puts only this page behind a tunnel: no IP, port or host name appears in it, and the DSH interface itself stays private.",
			localHint: "This snapshot is readable on this machine only: the Host has not enabled public sharing.",
			publicDisabled: "Public sharing off",
			publicReady: "Public link is live and copied to your clipboard. Anyone with it can read this snapshot page only.",
			exportFile: "Export web app",
			permanentLink: "Create share link",
			htmlhosterLink: "Share with HTML Hoster",
			htmlhosterHint: "Publishes to htmlhoster.com without an account. Daily network quotas apply; the host may add page components and does not guarantee permanent storage.",
			brewpageLink: "Share with BrewPage (expires)",
			brewpageHint: "Publishes an unlisted page to brewpage.app without an account. The service enforces expiry. You can revoke it sooner.",
			ttlLabel: "BrewPage link lifetime",
			expiresLabel: "Expires",
			expired: "The previous share has expired. Choose a lifetime and create a new link.",
			days: "days",
			permanentNote: "Share link (available after DSH closes)",
			permanentHint: "Independently hosted with no extra account. No expiry by default; revoke here. Availability and storage limits apply; export important conversations.",
			permanentBusy: "Uploading…",
			permanentFailed: "Could not create the share link",
			permanentReady: "Share link created and copied.",
			tunnelReady: "Link created and copied. It stays open while this DSH runs; it stops when DSH stops.",
			tunnelNote: "Public link (while DSH runs)",
			publicBusy: "Public link on",
			preparing: "Preparing tunnel",
			connecting: "Opening tunnel…",
			publicFailed: "Could not start the public tunnel",
			localNote: "Local link",
			publicNote: "Public link",
		};
		const isZh = typeof navigator !== "undefined" && /^zh/i.test(String(navigator.language ?? ""));
		const t = isZh ? zh : en;

		const css = `
.dsh-share-root{flex:none;align-self:center;display:inline-flex}
.dsh-share-btn{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:var(--dsw-radius-sm,6px);
  border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.28));background:transparent;color:var(--dsw-alias-label-primary,inherit);
  font-family:var(--dsw-font-family,inherit);font-size:11px;line-height:16px;cursor:pointer;white-space:nowrap}
.dsh-share-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.dsh-share-btn:disabled{cursor:default;opacity:.7}
.dsh-share-backdrop{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.32);display:flex;align-items:center;justify-content:center;padding:16px}
.dsh-share-panel{width:min(480px,100%);background:var(--dsw-alias-bg-popover,#fff);color:var(--dsw-alias-label-primary,#1f2328);
  border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.28);padding:18px 18px 14px;font-family:var(--dsw-font-family,inherit)}
.dsh-share-head{font-size:14px;font-weight:600;margin-bottom:6px}
.dsh-share-note{font-size:12px;line-height:1.6;opacity:.72;margin-bottom:12px}
.dsh-share-label{font-size:11px;opacity:.6;margin-bottom:4px}
.dsh-share-row{display:flex;gap:8px;margin-bottom:10px}
.dsh-share-input{flex:1;min-width:0;height:32px;padding:0 10px;border-radius:8px;font-size:12px;
  border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.3));background:var(--dsw-alias-bg-base,rgba(128,128,128,.06));
  color:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.dsh-share-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:4px}
.dsh-share-action{height:30px;padding:0 12px;border-radius:8px;font-size:12px;cursor:pointer;
  border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.3));background:transparent;color:inherit}
.dsh-share-action:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.dsh-share-action:disabled{opacity:.6;cursor:default}
.dsh-share-action.primary{background:var(--dsw-alias-brand-primary,#4d6bfe);border-color:transparent;color:#fff}
.dsh-share-action.primary:hover:not(:disabled){filter:brightness(1.06)}
.dsh-share-action.danger{color:#d3453b}
.dsh-share-error{font-size:12px;color:#d3453b;margin-bottom:10px;line-height:1.5}
.dsh-share-ok{font-size:12px;color:#2f9e59;margin-bottom:10px}
.dsh-share-foot{font-size:11px;opacity:.6;line-height:1.6;margin-top:12px}
`;
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${TAG_ID}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-share";
			tag.dataset.pluginCss = TAG_ID;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		/** Copy text, falling back to a hidden textarea when the clipboard API is denied. */
		function copyText(text) {
			const fallback = () => {
				try {
					const area = document.createElement("textarea");
					area.value = text;
					area.style.position = "fixed";
					area.style.opacity = "0";
					document.body.appendChild(area);
					area.select();
					const ok = document.execCommand("copy");
					area.remove();
					return ok;
				} catch {
					return false;
				}
			};
			if (typeof navigator !== "undefined" && navigator.clipboard?.writeText !== undefined) {
				return navigator.clipboard.writeText(text).then(
					() => true,
					() => fallback(),
				);
			}
			return Promise.resolve(fallback());
		}

		/** One POST to the Host management surface. */
		async function postPath(path, body) {
			const response = await fetch(`${PREFIX}${path}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body ?? {}),
			});
			let payload = null;
			try {
				payload = await response.json();
			} catch {
				payload = null;
			}
			return { status: response.status, payload };
		}

		/** Share icon: a box with an arrow leaving it. */
		function ShareIcon() {
			return react.createElement(
				"svg",
				{ width: 13, height: 13, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
				react.createElement("path", {
					d: "M8.75 2.5h4.75v4.75",
					stroke: "currentColor",
					strokeWidth: "1.3",
					strokeLinecap: "round",
					strokeLinejoin: "round",
				}),
				react.createElement("path", { d: "M13.5 2.5 7.25 8.75", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round" }),
				react.createElement("path", {
					d: "M12 9.5v3.25a.75.75 0 0 1-.75.75h-7a.75.75 0 0 1-.75-.75v-7a.75.75 0 0 1 .75-.75H7.5",
					stroke: "currentColor",
					strokeWidth: "1.3",
					strokeLinecap: "round",
					strokeLinejoin: "round",
				}),
			);
		}

		/** A labelled, read-only link row with a copy button. */
		function LinkRow(props) {
			return react.createElement(
				react.Fragment,
				null,
				react.createElement("div", { className: "dsh-share-label" }, props.label),
				react.createElement(
					"div",
					{ className: "dsh-share-row" },
					react.createElement("input", {
						className: "dsh-share-input",
						value: props.url,
						readOnly: true,
						onFocus: (event) => event.target.select(),
						"aria-label": props.label,
					}),
					react.createElement(
						"button",
						{ type: "button", className: "dsh-share-action", onClick: () => props.onCopy(props.url) },
						props.copied ? t.copied : t.copy,
					),
					react.createElement(
						"button",
						{ type: "button", className: "dsh-share-action", onClick: () => window.open(props.url, "_blank", "noopener,noreferrer") },
						t.open,
					),
						props.onExport === undefined
							? null
							: react.createElement("button", { type: "button", className: "dsh-share-action", onClick: props.onExport }, t.exportFile),
					),
			);
		}

		/** The header entry: button plus its dialog. */
		function ShareButton(props) {
			const sessionId = typeof props?.sessionId === "string" ? props.sessionId : "";
			const [open, setOpen] = react.useState(false);
			const [busy, setBusy] = react.useState(false);
			const [share, setShare] = react.useState(null);
			const [tunnel, setTunnel] = react.useState({ phase: "stopped", allowed: false, publish: { allowed: false }, progress: undefined });
			const [error, setError] = react.useState("");
			const [notice, setNotice] = react.useState("");
			const [copied, setCopied] = react.useState("");
			const [permanent, setPermanent] = react.useState(null);
			const [permanentProvider, setPermanentProvider] = react.useState(null);
			const [brewpageDays, setBrewpageDays] = react.useState(7);
			const [expiresAt, setExpiresAt] = react.useState(0);
			const currentSession = react.useRef(sessionId);
			currentSession.current = sessionId;
			react.useEffect(() => {
				setOpen(false); setShare(null); setPermanent(null); setPermanentProvider(null); setExpiresAt(0); setBrewpageDays(7); setError(""); setNotice(""); setCopied("");
			}, [sessionId]);
			const unprepared = react.useRef(false);

			const close = react.useCallback(() => {
				setOpen(false);
				setError("");
				setNotice("");
				setCopied("");
			}, []);

			const refreshTunnel = react.useCallback(async () => {
				try {
					const response = await fetch(`${PREFIX}/tunnel/status`, { headers: { accept: "application/json" } });
					if (response.ok) setTunnel(await response.json());
				} catch {
					/* status is advisory */
				}
			}, []);

			react.useEffect(() => {
				if (!open) return undefined;
				const onKey = (event) => {
					if (event.key === "Escape") close();
				};
				window.addEventListener("keydown", onKey);
				void refreshTunnel();
				return () => window.removeEventListener("keydown", onKey);
			}, [open, close, refreshTunnel]);

			const mint = react.useCallback(async () => {
				const { status, payload } = await postPath("/create", { sessionId });
				if (status === 200 && payload?.ok === true) {
					if (currentSession.current !== sessionId) return false;
					setShare({ id: payload.id, url: payload.url, title: payload.title, reused: payload.reused === true });
					setPermanent(null); setPermanentProvider(null); setExpiresAt(0);
					setNotice(payload.reused === true ? t.reuse : "");
					try {
						const listing = await fetch(`${PREFIX}/list?sessionId=${encodeURIComponent(sessionId)}`);
						if (listing.ok) {
							const row = (await listing.json()).shares?.find(row => row.id === payload.id);
							if (currentSession.current === sessionId && row?.publishedUrl && row.publishedProvider !== "tunnel") {
								if (row.expiresAt > 0 && row.expiresAt <= Date.now()) { setNotice(t.expired); }
								else { setPermanent(row.publishedUrl); setPermanentProvider(row.publishedProvider); setExpiresAt(row.expiresAt ?? 0); if ([1,3,7,30].includes(row.ttlDays)) setBrewpageDays(row.ttlDays); }
							}
						}
					} catch { /* local preview still works when listing fails */ }
					return payload;
				}
				if (status === 422) setError(t.empty);
				else if (status === 401 || status === 403) setError(t.forbidden);
				else setError(`${t.failed} (HTTP ${status})`);
				return false;
			}, [sessionId]);

			const create = react.useCallback(async () => {
				if (sessionId === "" || busy) return;
				setBusy(true);
				setError("");
				setNotice("");
				setCopied("");
				try {
					await mint();
				} catch (cause) {
					setError(`${t.failed}: ${String(cause?.message ?? cause)}`);
				} finally {
					if (currentSession.current === sessionId) setOpen(true);
					setBusy(false);
				}
			}, [busy, mint, sessionId]);

			const makePermanent = react.useCallback(async (provider) => {
				if (share === null || busy) return;
				setBusy(true);
				setError("");
				try {
					const { status, payload } = await postPath("/publish", { id: share.id, ...(['htmlhoster', 'brewpage'].includes(provider) ? { provider } : {}), ...(provider === 'brewpage' ? { ttlDays: brewpageDays } : {}) });
					if (currentSession.current !== sessionId) return;
					if (status === 200 && payload?.ok === true) {
						setPermanent(payload.url);
						setPermanentProvider(payload.provider ?? null);
						setExpiresAt(payload.expiresAt ?? 0);
						setCopied((await copyText(payload.url)) ? payload.url : "");
						setNotice(payload.provider === "tunnel" ? t.tunnelReady : t.permanentReady);
					} else {
						setError(`${t.permanentFailed}: ${payload?.message ?? `HTTP ${status}`}`);
					}
				} catch (cause) {
					setError(`${t.permanentFailed}: ${String(cause?.message ?? cause)}`);
				} finally {
					setBusy(false);
				}
			}, [busy, share, sessionId, brewpageDays]);

			const makePublic = react.useCallback(async () => {
				setBusy(true);
				setError("");
				setNotice("");
				const poll = setInterval(() => void refreshTunnel(), 2000);
				try {
					const { status, payload } = await postPath("/tunnel/start", {});
					if (status !== 200 || payload?.ok !== true) {
						setError(`${t.publicFailed}: ${payload?.message ?? `HTTP ${status}`}`);
						return;
					}
					setTunnel({ phase: "running", allowed: true, url: payload.url });
					const minted = await mint();
					if (minted?.url !== undefined) {
						// The link is the point of the click: put it on the clipboard.
						setCopied((await copyText(minted.url)) ? minted.url : "");
						setNotice(t.publicReady);
					}
				} catch (cause) {
					setError(`${t.publicFailed}: ${String(cause?.message ?? cause)}`);
				} finally {
					clearInterval(poll);
					await refreshTunnel();
					setBusy(false);
				}
			}, [mint, refreshTunnel]);

			const revoke = react.useCallback(async () => {
				if (share === null) return;
				setBusy(true);
				try {
					const { status } = await postPath("/revoke", { id: share.id });
					if (status === 200) {
						setShare(null);
						setPermanent(null); setPermanentProvider(null); setExpiresAt(0); setCopied("");
						setNotice(t.revoked);
					} else {
						setError(`${t.failed} (HTTP ${status})`);
					}
				} catch (cause) {
					setError(String(cause?.message ?? cause));
				} finally {
					setBusy(false);
				}
			}, [share]);

			if (typeof props?.sessionId !== "string") return null;

			const publicAllowed = tunnel?.allowed === true;
			const publishAllowed = tunnel?.publish?.allowed === true;
			const publicReady = publicAllowed && (tunnel?.phase === "running" || typeof tunnel?.pinned === "string");
			const busyLabel =
				tunnel?.phase === "downloading"
					? `${t.preparing} ${tunnel.progress === undefined ? "" : `${tunnel.progress}%`}`
					: t.connecting;
			const urlIsPublic = share !== null && publicReady === true && /^https:\/\//.test(share.url);

			const dialog =
				open === false
					? null
					: react.createElement(
							"div",
							{
								className: "dsh-share-backdrop",
								onMouseDown: (event) => {
									if (event.target === event.currentTarget) close();
								},
							},
							react.createElement(
								"div",
								{ className: "dsh-share-panel", role: "dialog", "aria-modal": "true", "aria-label": t.title },
								react.createElement("div", { className: "dsh-share-head" }, t.title),
								react.createElement("div", { className: "dsh-share-note" }, t.hint),
								error !== "" ? react.createElement("div", { className: "dsh-share-error" }, error) : null,
								notice !== "" ? react.createElement("div", { className: "dsh-share-ok" }, notice) : null,
								share !== null
									? react.createElement(LinkRow, {
											label: urlIsPublic ? t.publicNote : t.localNote,
											url: share.url,
											copied: copied === share.url,
											onCopy: async (url) => setCopied((await copyText(url)) ? url : ""),
											onExport: () => window.open(`${share.url}/app`, "_blank", "noopener,noreferrer"),
										})
									: null,
								react.createElement(
									"div",
									{ className: "dsh-share-actions" },
									permanent !== null
									  ? react.createElement(LinkRow, {
									    label: permanentProvider === "tunnel" ? t.tunnelNote : `${t.permanentNote} · ${permanentProvider === 'brewpage' ? 'BrewPage' : permanentProvider === 'htmlhoster' ? 'HTML Hoster' : 'DSH Share'}`,
									    url: permanent,
									    copied: copied === permanent,
									    onCopy: async (url) => setCopied((await copyText(url)) ? url : ""),
									  })
									  : null,
									expiresAt > 0 && permanent !== null ? react.createElement('div', { className: 'dsh-share-note' }, `${t.expiresLabel}：${new Date(expiresAt).toLocaleString()}`) : null,
									share !== null && tunnel?.publish?.brewpage === true && permanent === null
									  ? react.createElement('label', { className: 'dsh-share-note' }, t.ttlLabel + ' ',
									      react.createElement('select', { 'aria-label': t.ttlLabel, value: brewpageDays, disabled: busy, onChange: event => setBrewpageDays(Number(event.target.value)) },
									        [1,3,7,30].map(days => react.createElement('option', { key: days, value: days }, `${days} ${t.days}`)))) : null,
									share !== null && tunnel?.publish?.brewpage === true && permanent === null
									  ? react.createElement('button', { type: 'button', className: 'dsh-share-action primary', onClick: () => makePermanent('brewpage'), disabled: busy, title: t.brewpageHint }, busy ? t.permanentBusy : t.brewpageLink) : null,
									share !== null && publicAllowed && publicReady === false
										? react.createElement(
												"button",
												{ type: "button", className: "dsh-share-action primary", onClick: makePublic, disabled: busy },
												busy ? busyLabel : t.publicLink,
											)
										: null,
									share !== null && publishAllowed && permanent === null
									  ? react.createElement(
									    "button",
									    { type: "button", className: "dsh-share-action", onClick: () => makePermanent(), disabled: busy },
									    busy ? t.permanentBusy : t.permanentLink,
									  )
									  : null,
									share !== null && tunnel?.publish?.htmlhoster === true && permanent === null
									  ? react.createElement('button', { type: 'button', className: 'dsh-share-action', onClick: () => makePermanent('htmlhoster'), disabled: busy, title: t.htmlhosterHint }, busy ? t.permanentBusy : t.htmlhosterLink) : null,
									share !== null ? react.createElement("button", { type: "button", className: "dsh-share-action danger", onClick: revoke, disabled: busy }, t.revoke) : null,
									react.createElement("button", { type: "button", className: "dsh-share-action", onClick: close }, t.close),
								),
								react.createElement("div", { className: "dsh-share-foot" }, permanentProvider === 'brewpage' || permanent === null && tunnel?.publish?.brewpage ? t.brewpageHint : permanentProvider === 'htmlhoster' ? t.htmlhosterHint : t.permanentHint),
							),
						);

			return react.createElement(
				"span",
				{ className: "dsh-share-root" },
				react.createElement(
					"button",
					{
						type: "button",
						className: "dsh-share-btn",
						title: t.share,
						"aria-label": t.share,
						"data-dsh-share": "",
						disabled: busy,
						onClick: create,
					},
					react.createElement(ShareIcon, null),
					react.createElement("span", null, busy ? t.creating : t.share),
				),
				dialog,
			);
		}

		const name = "share";
		const inject = ["slots"];

		/** Register the header entry; `inject` waits for the slot's owner to appear. */
		function apply(ctx) {
			ctx.slots.inject(SLOT, () =>
				ctx.slots.register(
					{
						name: SLOT,
						id: "share",
						order: 10,
					},
					ShareButton,
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	},
});

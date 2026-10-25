# Changelog

## 0.5.0 — 2026-10-25

- Add an in-dialog text preview, per-message selection, last-turn selection and editable share titles. Saving changes creates an immutable snapshot before any upload.
- Add conversation share history and Markdown export; keep earlier links accessible after new conversation turns.
- Serialize publication and revocation for a snapshot, reject overlapping new uploads during revocation, and preserve legacy deletion records on failure.
- Fail closed on corrupt indexes/journals; serialize same-process store instances; retain management records when snapshot files disappear. Use owner-only file modes where supported and 128-bit random snapshot IDs.
- Improve mixed-case, escaped and alternate-separator path redaction; add default scrubbing for recognisable credential fields, access tokens and private keys.
- Bound HTML upload sizes and hosting responses, disallow implicit provider fallback, and preserve explicit service selection.
- Fix markdown link reprocessing, fenced-code delimiter handling and deep blockquote recursion. Use explicit UTC in hosted page timestamps.
- Improve small-screen/dark-mode layout, keyboard focus and stale-session handling. Preserve optional temporary tunnels behind their explicit configuration.
- Make the source installer preserve Cordis patches and back up separately managed plugin installations. Include installers in the package.
- Add regression coverage and an actual-package privacy audit to CI.

## 0.4.1

- Remove personal relay defaults and require an explicitly configured relay URL.
- Reject an unconfigured relay without contacting fallback services.

## 0.4.0

- Introduce explicit BrewPage publishing with 1/3/7/30-day retention and revocation.
- Superseded; use 0.4.1 or later.

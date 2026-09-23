const COLORS = { breaking: '#b42318', recovery: '#12805c' };

const STYLE = {
  wrapper: 'font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;',
  card: 'border:1px solid #e2e2e2;border-radius:8px;overflow:hidden;',
  header: 'padding:16px 20px;color:#fff;font-size:18px;font-weight:600;',
  body: 'padding:20px;background:#ffffff;',
  meta: 'margin:0 0 16px;font-size:14px;color:#444;line-height:1.6;',
  list: 'margin:0;padding-left:20px;font-family:Consolas,Menlo,monospace;font-size:13px;line-height:1.8;',
  listItem: 'color:#b42318;',
};

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

/** "TYPE_CHANGED: $.id (number -> string)" / "REMOVED: $.completed" */
function formatChangeLine(change) {
  if (change.kind === 'TYPE_CHANGED') {
    return `TYPE_CHANGED: ${change.path} (${change.from.join('|')} -> ${change.to.join('|')})`;
  }
  return `${change.kind}: ${change.path}`;
}

function metaHtml({ monitor, responseTimeMs }) {
  const responseLine = responseTimeMs != null ? `<strong>Response time:</strong> ${responseTimeMs}ms<br/>` : '';
  return `<p style="${STYLE.meta}"><strong>Monitor:</strong> ${escapeHtml(monitor.name)}<br/>` +
    `<strong>URL:</strong> ${escapeHtml(monitor.url)}<br/>${responseLine}</p>`;
}

function metaLines({ monitor, responseTimeMs }) {
  return [`Monitor: ${monitor.name}`, `URL: ${monitor.url}`, responseTimeMs != null ? `Response time: ${responseTimeMs}ms` : null].filter(
    Boolean
  );
}

/**
 * @param {Object} params
 * @param {{ name: string, url: string }} params.monitor
 * @param {import('../schema/diffSchemas.js').SchemaChange[]} params.changes  full change list; non-breaking entries are filtered out
 * @param {number} [params.responseTimeMs]
 * @param {boolean} [params.isFollowUp]  true when this is new damage on an already-open break
 */
export function buildBreakingAlertEmail({ monitor, changes, responseTimeMs, isFollowUp = false }) {
  const breaking = changes.filter((change) => change.breaking);
  const title = isFollowUp ? 'New Breaking Changes Detected' : 'Breaking Schema Drift Detected';
  const intro = isFollowUp
    ? 'Additional breaking changes were found on top of an already-open issue.'
    : 'This endpoint no longer matches its accepted baseline schema.';

  const listItemsHtml = breaking.map((c) => `<li style="${STYLE.listItem}">${escapeHtml(formatChangeLine(c))}</li>`).join('');

  const html = `<div style="${STYLE.wrapper}"><div style="${STYLE.card}">` +
    `<div style="${STYLE.header}background:${COLORS.breaking};">🚨 ${escapeHtml(title)}</div>` +
    `<div style="${STYLE.body}">${metaHtml({ monitor, responseTimeMs })}` +
    `<p style="${STYLE.meta}">${escapeHtml(intro)}</p>` +
    `<ul style="${STYLE.list}">${listItemsHtml}</ul></div></div></div>`;

  const text = [
    `🚨 ${title} — ${monitor.name}`,
    ...metaLines({ monitor, responseTimeMs }),
    '',
    intro,
    '',
    ...breaking.map(formatChangeLine),
  ].join('\n');

  return { subject: `🚨 ${title} — ${monitor.name}`, html, text };
}

/**
 * @param {Object} params
 * @param {{ name: string, url: string }} params.monitor
 * @param {number} [params.responseTimeMs]
 */
export function buildRecoveryAlertEmail({ monitor, responseTimeMs }) {
  const message = "This endpoint's response now matches its accepted baseline schema again.";

  const html = `<div style="${STYLE.wrapper}"><div style="${STYLE.card}">` +
    `<div style="${STYLE.header}background:${COLORS.recovery};">✅ API Recovered</div>` +
    `<div style="${STYLE.body}">${metaHtml({ monitor, responseTimeMs })}` +
    `<p style="${STYLE.meta}">${escapeHtml(message)}</p></div></div></div>`;

  const text = [`✅ API Recovered — ${monitor.name}`, ...metaLines({ monitor, responseTimeMs }), '', message].join('\n');

  return { subject: `✅ API Recovered — ${monitor.name}`, html, text };
}
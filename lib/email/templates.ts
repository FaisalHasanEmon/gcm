// lib/email/templates.ts
// Production-quality HTML email templates for GCM.
// All emails use inline styles for email client compatibility, with a dark
// header matching the app's visual identity. CAN-SPAM / GDPR compliant.

export interface EmailEvent {
  headline?:       string;
  summary_20w?:    string;
  severity:        string;
  country_primary: string;
  confidence:      string;
  event_type?:     string;
  timestamp_utc?:  string;
}

type Frequency = 'instant' | 'hourly' | 'daily';

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#3b82f6',
};

function formatDate(iso: string): string {
  try { return new Date(iso).toUTCString().replace(' GMT', ' UTC'); }
  catch { return iso; }
}

function pill(label: string, bg: string, color = '#fff'): string {
  return `<span style="background:${bg};color:${color};padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;display:inline-block;line-height:1.8">${label}</span>`;
}

function layout(body: string, unsubUrl: string, appUrl: string): string {
  const unsubLine = unsubUrl
    ? `<a href="${unsubUrl}" style="color:#94a3b8;text-decoration:none">Unsubscribe</a> &nbsp;·&nbsp; `
    : '';
  const displayUrl = appUrl.replace(/^https?:\/\//, '');
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GCM</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

    <!-- Header -->
    <tr><td style="background:#0f172a;border-radius:10px 10px 0 0;padding:18px 28px">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td><span style="color:#f8fafc;font-size:17px;font-weight:800;letter-spacing:-.3px">⚡ GCM</span>
            <span style="color:#475569;font-size:12px;margin-left:8px">Global Conflict Monitor</span></td>
        <td align="right"><a href="${appUrl}" style="color:#475569;font-size:11px;text-decoration:none">${displayUrl}</a></td>
      </tr></table>
    </td></tr>

    <!-- Body -->
    <tr><td style="background:#ffffff;padding:26px 28px">${body}</td></tr>

    <!-- Footer -->
    <tr><td style="background:#f8fafc;border-radius:0 0 10px 10px;padding:14px 28px;border-top:1px solid #e2e8f0">
      <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.7">
        ${unsubLine}<span style="color:#cbd5e1">Information subject to change. Only confirmed and likely events are dispatched. GCM does not sell or share your email address.</span>
      </p>
    </td></tr>

  </table>
  </td></tr>
</table>
</body></html>`;
}

// ── Alert email (instant / hourly / daily) ────────────────────────────────────

export function alertEmailHtml(
  events:    EmailEvent[],
  frequency: Frequency,
  unsubUrl:  string,
  appUrl:    string,
): string {
  const isInstant = frequency === 'instant';
  const title     = isInstant ? '🚨 Breaking Alert' : `${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Digest`;
  const subtitle  = isInstant
    ? 'A high-priority conflict event has been detected.'
    : `${events.length} event${events.length !== 1 ? 's' : ''} in your monitored area${events.length !== 1 ? 's' : ''}.`;

  const eventRows = events.slice(0, 10).map(ev => {
    const sev   = ev.severity ?? 'low';
    const text  = ev.headline ?? ev.summary_20w ?? '(No headline)';
    const ts    = ev.timestamp_utc ? formatDate(ev.timestamp_utc) : '';
    return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #f1f5f9">
        <div style="margin-bottom:6px">
          ${pill(sev,             SEV_COLOR[sev] ?? '#64748b')}
          &nbsp;${pill(ev.confidence,    '#e2e8f0', '#475569')}
          &nbsp;${pill(ev.country_primary, '#f0fdf4', '#166534')}
        </div>
        <div style="font-size:14px;font-weight:600;color:#0f172a;line-height:1.45;margin-bottom:${ts ? '4px' : '0'}">${text}</div>
        ${ts ? `<div style="font-size:11px;color:#94a3b8">${ts}</div>` : ''}
      </td>
    </tr>`;
  }).join('');

  const body = `
    <h2 style="margin:0 0 4px;font-size:21px;font-weight:800;color:#0f172a;letter-spacing:-.3px">${title}</h2>
    <p style="margin:0 0 22px;font-size:13px;color:#64748b">${subtitle}</p>
    <table width="100%" cellpadding="0" cellspacing="0">${eventRows}</table>`;

  return layout(body, unsubUrl, appUrl);
}

export function alertEmailText(
  events:    EmailEvent[],
  frequency: Frequency,
  unsubUrl:  string,
): string {
  const header = frequency === 'instant' ? 'GCM BREAKING ALERT' : `GCM ${frequency.toUpperCase()} DIGEST`;
  const lines  = events.slice(0, 10).map(ev =>
    `[${(ev.severity ?? 'LOW').toUpperCase()}] ${ev.headline ?? ev.summary_20w}\n  ${ev.country_primary} · ${ev.confidence}`
  );
  const footer = unsubUrl ? `\nUnsubscribe: ${unsubUrl}` : '';
  return `${header}\n\n${lines.join('\n\n')}\n\nInformation subject to change. Confidence labels apply.${footer}`;
}

// ── Verification email ────────────────────────────────────────────────────────

export function verificationEmailHtml(verifyLink: string, appUrl: string): string {
  const body = `
    <h2 style="margin:0 0 8px;font-size:21px;font-weight:800;color:#0f172a">Confirm your subscription</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6">
      You requested conflict alert notifications from <strong>Global Conflict Monitor</strong>.<br>
      Click the button below to confirm your email address and activate your subscription.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr>
        <td style="background:#2563eb;border-radius:8px">
          <a href="${verifyLink}" style="display:inline-block;padding:13px 30px;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:.2px">Confirm Subscription →</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:12px;color:#94a3b8">Or paste this URL into your browser:</p>
    <p style="margin:0 0 16px;font-size:12px;color:#64748b;word-break:break-all">${verifyLink}</p>
    <p style="margin:0;font-size:12px;color:#cbd5e1">This link expires in 24 hours. If you didn't request this, ignore this email — no action needed.</p>`;
  return layout(body, '', appUrl);
}

export function verificationEmailText(verifyLink: string): string {
  return `Confirm your GCM subscription\n\nClick here: ${verifyLink}\n\nThis link expires in 24 hours. If you didn't subscribe, ignore this email.`;
}

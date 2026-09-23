import { describe, it, expect } from 'vitest';
import { buildBreakingAlertEmail, buildRecoveryAlertEmail } from '../../src/services/alerts/emailTemplate.js';

const monitor = { name: 'Weather API', url: 'https://api.example.com/weather' };

const changes = [
  { path: '$.humidity', kind: 'ADDED', from: [], to: ['number'], breaking: false },
  { path: '$.temp', kind: 'TYPE_CHANGED', from: ['number'], to: ['string'], breaking: true },
  { path: '$.completed', kind: 'REMOVED', from: ['boolean'], to: [], breaking: true },
];

describe('buildBreakingAlertEmail', () => {
  it('uses the initial-break title and subject by default', () => {
    const email = buildBreakingAlertEmail({ monitor, changes, responseTimeMs: 120 });
    expect(email.subject).toBe('🚨 Breaking Schema Drift Detected — Weather API');
    expect(email.html).toContain('Breaking Schema Drift Detected');
    expect(email.text).toContain('Breaking Schema Drift Detected — Weather API');
  });

  it('switches to the follow-up title and wording when isFollowUp is true', () => {
    const email = buildBreakingAlertEmail({ monitor, changes, isFollowUp: true });
    expect(email.subject).toBe('🚨 New Breaking Changes Detected — Weather API');
    expect(email.text).toContain('Additional breaking changes were found on top of an already-open issue.');
  });

  it('includes only breaking changes, formatted, and excludes non-breaking ones', () => {
    const email = buildBreakingAlertEmail({ monitor, changes });

    expect(email.text).toContain('TYPE_CHANGED: $.temp (number -> string)');
    expect(email.text).toContain('REMOVED: $.completed');
    expect(email.text).not.toContain('$.humidity'); // non-breaking ADDED must not appear
    expect(email.html).toContain('TYPE_CHANGED: $.temp (number -&gt; string)');
    expect(email.html).not.toContain('$.humidity');
  });

  it('includes monitor name, url, and response time when given', () => {
    const email = buildBreakingAlertEmail({ monitor, changes, responseTimeMs: 340 });
    expect(email.text).toContain('Monitor: Weather API');
    expect(email.text).toContain('URL: https://api.example.com/weather');
    expect(email.text).toContain('Response time: 340ms');
  });

  it('omits the response time line entirely when not provided', () => {
    const email = buildBreakingAlertEmail({ monitor, changes });
    expect(email.text).not.toMatch(/Response time/);
    expect(email.html).not.toMatch(/Response time/);
  });

  it('escapes HTML special characters in the monitor name/url instead of injecting them', () => {
    const maliciousMonitor = { name: '<script>alert(1)</script>', url: 'https://a.com/?x=1&y=2' };
    const email = buildBreakingAlertEmail({ monitor: maliciousMonitor, changes });

    expect(email.html).not.toContain('<script>alert(1)</script>');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(email.html).toContain('https://a.com/?x=1&amp;y=2');
  });

  it('produces an empty change list without throwing when there are no breaking changes (defensive — should not normally happen)', () => {
    const nonBreakingOnly = [{ path: '$.x', kind: 'ADDED', from: [], to: ['number'], breaking: false }];
    expect(() => buildBreakingAlertEmail({ monitor, changes: nonBreakingOnly })).not.toThrow();
  });
});

describe('buildRecoveryAlertEmail', () => {
  it('has the recovery subject and message', () => {
    const email = buildRecoveryAlertEmail({ monitor, responseTimeMs: 88 });
    expect(email.subject).toBe('✅ API Recovered — Weather API');
    expect(email.text).toContain("This endpoint's response now matches its accepted baseline schema again.");
    expect(email.html).toContain('API Recovered');
  });

  it('includes monitor context and omits response time when absent', () => {
    const email = buildRecoveryAlertEmail({ monitor });
    expect(email.text).toContain('Monitor: Weather API');
    expect(email.text).not.toMatch(/Response time/);
  });

  it('escapes HTML in the monitor name', () => {
    const email = buildRecoveryAlertEmail({ monitor: { name: '<b>X</b>', url: 'https://a.com' } });
    expect(email.html).not.toContain('<b>X</b>');
    expect(email.html).toContain('&lt;b&gt;X&lt;/b&gt;');
  });
});
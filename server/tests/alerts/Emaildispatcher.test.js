import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { createTransportMock, sendMailMock, createTestAccountMock, getTestMessageUrlMock } = vi.hoisted(() => ({
  createTransportMock: vi.fn(),
  sendMailMock: vi.fn(),
  createTestAccountMock: vi.fn(),
  getTestMessageUrlMock: vi.fn(() => 'https://ethereal.email/message/preview-id'),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: (...args) => createTransportMock(...args),
    createTestAccount: (...args) => createTestAccountMock(...args),
    getTestMessageUrl: (...args) => getTestMessageUrlMock(...args),
  },
}));

import { sendAlertEmail, _resetTransporterCacheForTests } from '../../../src/services/alerts/emailDispatcher.js';

const EMAIL = { to: 'ops@example.com', subject: 'Test', html: '<p>hi</p>', text: 'hi' };
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  _resetTransporterCacheForTests();
  createTransportMock.mockReturnValue({ sendMail: sendMailMock });
  sendMailMock.mockResolvedValue({ messageId: 'abc' });
  createTestAccountMock.mockResolvedValue({ user: 'eth-user', pass: 'eth-pass' });

  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.EMAIL_FROM;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('sendAlertEmail: no recipient', () => {
  it('skips without ever building a transporter', async () => {
    const result = await sendAlertEmail({ ...EMAIL, to: undefined });

    expect(result).toEqual({ sent: false, reason: 'NO_RECIPIENT' });
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(createTestAccountMock).not.toHaveBeenCalled();
  });

  it('treats an empty string the same as a missing recipient', async () => {
    const result = await sendAlertEmail({ ...EMAIL, to: '' });
    expect(result).toEqual({ sent: false, reason: 'NO_RECIPIENT' });
  });
});

describe('sendAlertEmail: SMTP configured', () => {
  beforeEach(() => {
    process.env.SMTP_HOST = 'smtp.mailtrap.io';
    process.env.SMTP_PORT = '2525';
    process.env.SMTP_USER = 'user1';
    process.env.SMTP_PASS = 'pass1';
    process.env.EMAIL_FROM = 'ChronoGit <alerts@chronogit.dev>';
  });

  it('builds a real transporter from env vars', async () => {
    await sendAlertEmail(EMAIL);

    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.mailtrap.io',
      port: 2525,
      secure: false,
      auth: { user: 'user1', pass: 'pass1' },
    });
    expect(createTestAccountMock).not.toHaveBeenCalled();
  });

  it('marks the connection secure for port 465', async () => {
    process.env.SMTP_PORT = '465';
    await sendAlertEmail(EMAIL);
    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ secure: true }));
  });

  it('sends with the configured EMAIL_FROM and the given fields', async () => {
    await sendAlertEmail(EMAIL);
    expect(sendMailMock).toHaveBeenCalledWith({
      from: 'ChronoGit <alerts@chronogit.dev>',
      to: EMAIL.to,
      subject: EMAIL.subject,
      html: EMAIL.html,
      text: EMAIL.text,
    });
  });

  it('falls back to a default From address when EMAIL_FROM is not set', async () => {
    delete process.env.EMAIL_FROM;
    await sendAlertEmail(EMAIL);
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ from: expect.stringContaining('ChronoGit') }));
  });

  it('returns { sent: true } on success', async () => {
    await expect(sendAlertEmail(EMAIL)).resolves.toEqual({ sent: true });
  });

  it('reuses the same transporter across multiple sends instead of rebuilding it', async () => {
    await sendAlertEmail(EMAIL);
    await sendAlertEmail(EMAIL);

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
  });

  it('catches a send failure and reports it instead of throwing', async () => {
    sendMailMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(sendAlertEmail(EMAIL)).resolves.toEqual({
      sent: false,
      reason: 'SEND_FAILED',
      error: 'ECONNREFUSED',
    });
  });
});

describe('sendAlertEmail: no SMTP configured (Ethereal fallback)', () => {
  it('creates a test account and sends through smtp.ethereal.email', async () => {
    await sendAlertEmail(EMAIL);

    expect(createTestAccountMock).toHaveBeenCalledTimes(1);
    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: 'eth-user', pass: 'eth-pass' },
    });
  });

  it('logs a preview URL for the sent message', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendAlertEmail(EMAIL);

    expect(getTestMessageUrlMock).toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalledWith('[email] preview:', 'https://ethereal.email/message/preview-id');
  });

  it('reuses the same Ethereal account across sends (creates it only once)', async () => {
    await sendAlertEmail(EMAIL);
    await sendAlertEmail(EMAIL);
    expect(createTestAccountMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to NOT_CONFIGURED (and does not throw) when Ethereal itself is unreachable', async () => {
    createTestAccountMock.mockRejectedValue(new Error('network unreachable'));
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(sendAlertEmail(EMAIL)).resolves.toEqual({ sent: false, reason: 'NOT_CONFIGURED' });
    expect(consoleWarn).toHaveBeenCalled();
  });
});
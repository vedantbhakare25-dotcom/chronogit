'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export default function AlertPreferenceModal({ accountEmail, preference, onSaved, onDismiss }) {
  const [type, setType] = useState(preference?.type || 'ACCOUNT_EMAIL');
  const [customEmail, setCustomEmail] = useState(preference?.customEmail || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setType(preference?.type || 'ACCOUNT_EMAIL');
    setCustomEmail(preference?.customEmail || '');
  }, [preference]);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          ...(type === 'CUSTOM_EMAIL' ? { customEmail: customEmail.trim() } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save alert preference');
      onSaved(data);
    } catch (err) {
      setError(err.message || 'Could not save alert preference');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="alert-onboarding-title"
        className="relative w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
        <button type="button" onClick={onDismiss} aria-label="Dismiss alert email setup"
          className="absolute right-4 top-4 rounded p-1 text-neutral-400 hover:text-white">
          <X className="h-4 w-4" />
        </button>
        <p className="text-xs font-medium uppercase tracking-wide text-rose-400">One-time setup</p>
        <h2 id="alert-onboarding-title" className="mt-2 text-lg font-semibold text-white">
          Confirm your alert destination
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          Breaking API changes will be sent to the email you choose here.
        </p>

        <form onSubmit={save} className="mt-5 space-y-3">
          <label className="flex cursor-pointer gap-3 rounded-xl border border-neutral-700 bg-neutral-950/70 p-4">
            <input type="radio" name="alertDestination" value="ACCOUNT_EMAIL"
              checked={type === 'ACCOUNT_EMAIL'} onChange={() => setType('ACCOUNT_EMAIL')} className="mt-1" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-white">Use this Google email</span>
              <span className="block truncate text-xs text-neutral-400">{accountEmail || 'Account email unavailable'}</span>
            </span>
          </label>

          <label className="flex cursor-pointer gap-3 rounded-xl border border-neutral-700 bg-neutral-950/70 p-4">
            <input type="radio" name="alertDestination" value="CUSTOM_EMAIL"
              checked={type === 'CUSTOM_EMAIL'} onChange={() => setType('CUSTOM_EMAIL')} className="mt-1" />
            <span className="text-sm font-medium text-white">Use a custom alert email</span>
          </label>

          {type === 'CUSTOM_EMAIL' && (
            <input type="email" required autoComplete="email" value={customEmail}
              onChange={(event) => setCustomEmail(event.target.value)}
              placeholder="alerts@example.com"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-rose-500" />
          )}
          {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onDismiss}
              className="rounded-lg px-3 py-2 text-sm text-neutral-400 hover:text-white">Not now</button>
            <button type="submit" disabled={saving || (type === 'ACCOUNT_EMAIL' && !accountEmail)}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save destination'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

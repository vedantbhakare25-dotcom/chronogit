'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';

export default function SettingsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [preference, setPreference] = useState({ type: 'ACCOUNT_EMAIL', customEmail: '' });
  const [effectiveEmail, setEffectiveEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/');
    if (status !== 'authenticated') return;
    fetch('/api/user/preferences')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load preferences');
        setPreference({
          type: data.alertEmailPreference?.type || 'ACCOUNT_EMAIL',
          customEmail: data.alertEmailPreference?.customEmail || '',
        });
        setEffectiveEmail(data.effectiveAlertEmail || '');
      })
      .catch((err) => setMessage(err.message))
      .finally(() => setLoading(false));
  }, [status, router]);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: preference.type,
          customEmail: preference.type === 'CUSTOM_EMAIL' ? preference.customEmail : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save preferences');
      setPreference({
        type: data.alertEmailPreference.type,
        customEmail: data.alertEmailPreference.customEmail || '',
      });
      setEffectiveEmail(data.effectiveAlertEmail || '');
      setMessage('Preferences saved.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-xl font-semibold">Alert email settings</h1>
        {loading ? <p className="mt-6 text-sm text-neutral-400">Loading preferences…</p> : (
          <form onSubmit={save} className="mt-6 space-y-5 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
            <label className="flex items-center gap-3 text-sm">
              <input type="radio" name="emailType" value="ACCOUNT_EMAIL"
                checked={preference.type === 'ACCOUNT_EMAIL'}
                onChange={() => setPreference((old) => ({ ...old, type: 'ACCOUNT_EMAIL' }))} />
              Use account email
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input type="radio" name="emailType" value="CUSTOM_EMAIL"
                checked={preference.type === 'CUSTOM_EMAIL'}
                onChange={() => setPreference((old) => ({ ...old, type: 'CUSTOM_EMAIL' }))} />
              Use a custom email
            </label>
            {preference.type === 'CUSTOM_EMAIL' && (
              <input type="email" required value={preference.customEmail}
                onChange={(event) => setPreference((old) => ({ ...old, customEmail: event.target.value }))}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                placeholder="alerts@example.com" />
            )}
            <p className="text-xs text-neutral-400">Alerts currently go to {effectiveEmail || '—'}.</p>
            <button disabled={saving} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium disabled:opacity-50">
              {saving ? 'Saving…' : 'Save preferences'}
            </button>
            {message && <p role="status" className="text-sm text-neutral-300">{message}</p>}
          </form>
        )}
      </main>
    </div>
  );
}

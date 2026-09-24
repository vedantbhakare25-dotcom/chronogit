'use client';

import { useState } from 'react';
import { X, Plus, Sparkles } from 'lucide-react';

export default function AddMonitorModal({ isOpen, onClose, onCreated, effectiveAlertEmail = '' }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleFillMock = (driftType = '') => {
    setName('Demo Weather API');
    const port = 4000;
    setUrl(`http://localhost:${port}/api/mock/weather${driftType ? `?drift=${driftType}` : ''}`);
    setIntervalMinutes(5);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          url,
          intervalMinutes: Number(intervalMinutes),
          alerts: email.trim() ? { email: email.trim() } : {},
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create monitor');
      }

      onCreated(data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl relative">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <div>
            <h2 className="text-base font-semibold text-white">Add New Endpoint Monitor</h2>
            <p className="text-xs text-neutral-400">Establishes a baseline contract schema immediately.</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Mock Preset for demo */}
        <div className="mt-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-between">
          <div className="text-xs text-rose-300">
            <span className="font-semibold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Demo Shortcut:
            </span>
            Prefill with local Weather API
          </div>
          <button
            type="button"
            onClick={() => handleFillMock()}
            className="px-2.5 py-1 rounded text-xs bg-rose-500 text-white font-medium hover:bg-rose-600 transition"
          >
            Auto-Fill
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Monitor Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Products API"
              className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-white focus:outline-none focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Endpoint URL (HTTP/HTTPS)</label>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/data"
              className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-white focus:outline-none focus:border-rose-500 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Check Interval</label>
              <select
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-white focus:outline-none focus:border-rose-500"
              >
                <option value={1}>Every 1 min (Testing)</option>
                <option value={5}>Every 5 mins</option>
                <option value={15}>Every 15 mins</option>
                <option value={60}>Every 1 hour</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Per-monitor Alert Email (Optional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={effectiveAlertEmail ? `Default: ${effectiveAlertEmail}` : 'Uses your profile alert email'}
                className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-white focus:outline-none focus:border-rose-500"
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                {effectiveAlertEmail
                  ? `Leave blank to use ${effectiveAlertEmail}.`
                  : 'Leave blank to use your saved alert preference.'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-white text-neutral-900 hover:bg-neutral-200 disabled:opacity-50 transition"
            >
              <Plus className="w-4 h-4" />
              {loading ? 'Establishing Baseline...' : 'Create Monitor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

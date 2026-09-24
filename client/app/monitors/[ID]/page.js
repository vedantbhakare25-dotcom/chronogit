'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { ArrowLeft, Play, Check, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function MonitorDetailPage() {
  const { ID: id } = useParams();

  const [monitor, setMonitor] = useState(null);
  const [logs, setLogs] = useState([]);
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [mRes, lRes] = await Promise.all([
        fetch(`/api/monitors/${id}`),
        fetch(`/api/monitors/${id}/logs?limit=15`),
      ]);

      if (!mRes.ok) {
        const body = await mRes.json().catch(() => ({}));
        throw new Error(body.error || 'Could not load monitor');
      }
      const data = await mRes.json();
      setMonitor(data);
      setChanges(data.pendingChanges || []);
      if (lRes.ok) {
        const lData = await lRes.json();
        setLogs(lData.logs || []);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not load monitor');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchData();
  }, [fetchData, id]);

  const handleCheckNow = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/monitors/${id}/check`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Check failed');
      setMonitor(data.monitor);
      setChanges(data.checkLog?.changes || []);
      setLogs((prev) => [data.checkLog, ...prev]);
      setError('');
    } catch (err) {
      setError(err.message || 'Check failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptChanges = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/monitors/${id}/accept`, { method: 'POST' });
      const updated = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(updated.error || 'Could not accept changes');
      setMonitor(updated);
      setChanges([]);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not accept changes');
    } finally {
      setActionLoading(false);
    }
  };

  // Render only the server's canonical diffSchemas output, including ignored
  // paths and ancestor collapsing exactly as the check engine applies them.
  const baselineStr = changes.map((change) =>
    change.from?.length ? `${change.path}: ${change.from.join(' | ')}` : ''
  ).filter(Boolean).join('\n');
  const latestStr = changes.map((change) =>
    change.to?.length ? `${change.path}: ${change.to.join(' | ')}` : ''
  ).filter(Boolean).join('\n');

  if (!loading && error && !monitor) {
    return <div className="min-h-screen bg-neutral-950 text-white"><Navbar /><main className="mx-auto max-w-6xl p-8"><p role="alert" className="text-rose-400">{error}</p></main></div>;
  }

  if (loading || !monitor) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-neutral-400 text-sm font-mono">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading monitor contract...
          </div>
        </div>
      </div>
    );
  }

  const hasDiff = changes.length > 0;

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 space-y-6">
        {error && <p role="alert" className="rounded-lg border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">{error}</p>}
        {/* Navigation Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Monitors
          </Link>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleCheckNow}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 transition disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} /> Check Now
            </button>

            {hasDiff && (
              <button
                onClick={handleAcceptChanges}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" /> Accept as New Baseline
              </button>
            )}
          </div>
        </div>

        {/* Monitor Header Box */}
        <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold text-white">{monitor.name}</h1>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                  monitor.status === 'HEALTHY'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : monitor.status === 'BREAKING'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}
              >
                {monitor.status}
              </span>
            </div>
            <p className="text-xs font-mono text-neutral-400 mt-1">{monitor.url}</p>
          </div>

          <div className="flex items-center gap-6 text-xs text-neutral-400 border-t sm:border-t-0 pt-3 sm:pt-0 border-neutral-800">
            <div>
              <span className="block text-neutral-400 text-[11px]">Interval</span>
              <span className="font-mono text-white">Every {monitor.intervalMinutes}m</span>
            </div>
            <div>
              <span className="block text-neutral-400 text-[11px]">Last Checked</span>
              <span className="font-mono text-white">
                {monitor.lastCheckedAt ? new Date(monitor.lastCheckedAt).toLocaleTimeString() : 'Never'}
              </span>
            </div>
          </div>
        </div>

        {/* Visual Diff Section */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/80">
            <span className="text-xs font-semibold tracking-wide uppercase text-neutral-300">
              Contract Schema Diff (Baseline vs Latest)
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              {hasDiff ? '⚠️ Schema Mutation Detected' : '✅ Exact Match with Baseline'}
            </span>
          </div>

          <div className="overflow-x-auto text-xs font-mono bg-[#0d1117]">
            <ReactDiffViewer
              oldValue={baselineStr}
              newValue={latestStr}
              splitView={true}
              leftTitle="Accepted Baseline Schema"
              rightTitle="Latest Response Schema"
              compareMethod={DiffMethod.WORDS}
              useDarkTheme={true}
              styles={{
                variables: {
                  dark: {
                    diffViewerBackground: '#0a0a0a',
                    diffViewerColor: '#d4d4d4',
                    addedBackground: '#042f1a',
                    addedColor: '#4ade80',
                    removedBackground: '#450a0a',
                    removedColor: '#f87171',
                    wordAdded: '#166534',
                    wordRemoved: '#991b1b',
                    addedGutterBackground: '#064e3b',
                    removedGutterBackground: '#7f1d1d',
                    gutterBackground: '#171717',
                    gutterBackgroundDark: '#0a0a0a',
                    highlightBackground: '#262626',
                    highlightGutterBackground: '#262626',
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Incident History & Check Logs */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Recent Check Telemetry</h2>

          {logs.length === 0 ? (
            <p className="text-xs text-neutral-400 py-4 text-center">No check logs recorded yet.</p>
          ) : (
            <div className="divide-y divide-neutral-800/80">
              {logs.map((log) => (
                <div key={log._id} className="py-3 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        log.outcome === 'OK'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : log.outcome === 'NON_BREAKING'
                          ? 'bg-sky-500/10 text-sky-400'
                          : log.outcome === 'BREAKING'
                          ? 'bg-rose-500/10 text-rose-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      {log.outcome}
                    </span>
                    <span className="text-neutral-400">{new Date(log.checkedAt).toLocaleString()}</span>
                  </div>

                  <div className="flex items-center gap-4 text-neutral-400">
                    <span>{log.responseTimeMs}ms</span>
                    <span className="px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800">
                      HTTP {log.httpStatus || 'N/A'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

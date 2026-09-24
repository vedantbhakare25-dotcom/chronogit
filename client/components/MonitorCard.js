'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Play, CheckCircle2, AlertTriangle, XCircle, Clock, ArrowRight, Trash2 } from 'lucide-react';

export default function MonitorCard({ monitor, onTriggerCheck, onDelete }) {
  const [checking, setChecking] = useState(false);

  const handleCheck = async (e) => {
    e.preventDefault();
    setChecking(true);
    await onTriggerCheck(monitor._id);
    setChecking(false);
  };

  const getStatusBadge = () => {
    switch (monitor.status) {
      case 'HEALTHY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Healthy
          </span>
        );
      case 'BREAKING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">
            <AlertTriangle className="w-3 h-3" /> Breaking Drift
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <XCircle className="w-3 h-3" /> Fetch Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
            <Clock className="w-3 h-3" /> Pending
          </span>
        );
    }
  };

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 hover:border-neutral-700 transition flex flex-col justify-between group">
      <div>
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <h3 className="font-medium text-white text-base truncate group-hover:text-rose-300 transition">
            {monitor.name}
          </h3>
          {getStatusBadge()}
        </div>

        <p className="text-xs font-mono text-neutral-400 truncate mb-4 bg-neutral-950 px-2.5 py-1 rounded border border-neutral-800/80">
          {monitor.url}
        </p>

        <div className="grid grid-cols-2 gap-2 text-xs text-neutral-400 pt-2 border-t border-neutral-800/60 mb-5">
          <div>
            <span className="text-neutral-400 block text-[11px]">Interval</span>
            <span className="font-mono text-neutral-300">Every {monitor.intervalMinutes}m</span>
          </div>
          <div>
            <span className="text-neutral-400 block text-[11px]">Last Checked</span>
            <span className="font-mono text-neutral-300">
              {monitor.lastCheckedAt ? new Date(monitor.lastCheckedAt).toLocaleTimeString() : 'Never'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-3 border-t border-neutral-800/60">
        <button
          onClick={handleCheck}
          disabled={checking}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 text-neutral-200 hover:bg-neutral-700 disabled:opacity-50 transition"
        >
          <Play className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
          {checking ? 'Checking...' : 'Check Now'}
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onDelete(monitor._id)}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
            title="Delete Monitor"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <Link
            href={`/monitors/${monitor._id}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition"
          >
            Diff View <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
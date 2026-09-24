'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import MonitorCard from '@/components/MonitorCard';
import AddMonitorModal from '@/components/AddMonitorModal';
import AlertPreferenceModal from '@/components/AlertPreferenceModal';
import { Plus, RefreshCw, Activity, ShieldCheck, AlertTriangle, XCircle } from 'lucide-react';

const DASHBOARD_CACHE_TTL_MS = 30_000;
const dashboardCache = new Map();

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [monitors, setMonitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [alertProfile, setAlertProfile] = useState(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  const fetchMonitors = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/monitors');
      if (res.ok) {
        const data = await res.json();
        setMonitors(data);
        const userId = session?.user?.id;
        if (userId) {
          dashboardCache.set(userId, {
            ...dashboardCache.get(userId),
            monitors: data,
            updatedAt: Date.now(),
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch monitors:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const userId = session?.user?.id;
    if (status === 'unauthenticated') {
      setLoading(false);
      setMonitors([]);
      setAlertProfile(null);
      return;
    }
    if (status !== 'authenticated' || !userId) return;

    let cancelled = false;
    const dismissalKey = `alert-email-onboarding-dismissed:${userId}`;
    setOnboardingDismissed(
      typeof window !== 'undefined' && window.sessionStorage.getItem(dismissalKey) === '1'
    );
    const cached = dashboardCache.get(userId);
    if (cached) {
      setMonitors(cached.monitors || []);
      setAlertProfile(cached.profile || null);
      setLoading(false);
    } else {
      setLoading(true);
    }
    if (cached && Date.now() - cached.updatedAt < DASHBOARD_CACHE_TTL_MS) {
      return () => { cancelled = true; };
    }

    // Load monitor cards and profile preferences in parallel; either result
    // can render from cache while stale data is being refreshed.
    Promise.allSettled([fetch('/api/monitors'), fetch('/api/user/preferences')])
      .then(async ([monitorResult, profileResult]) => {
        if (monitorResult.status === 'rejected') throw monitorResult.reason;
        const monitorResponse = monitorResult.value;
        const profileResponse = profileResult.status === 'fulfilled' ? profileResult.value : null;
        const [monitorData, profileData] = await Promise.all([
          monitorResponse.json().catch(() => ({})),
          profileResponse?.json().catch(() => ({})) || Promise.resolve({}),
        ]);
        if (!monitorResponse.ok) throw new Error(monitorData.error || 'Could not load monitors');
        if (cancelled) return;
        setMonitors(monitorData);
        const profile = profileResponse?.ok ? profileData : (cached?.profile || null);
        setAlertProfile(profile);
        dashboardCache.set(userId, { monitors: monitorData, profile, updatedAt: Date.now() });
      })
      .catch((err) => console.error('Failed to load dashboard data:', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [status, session?.user?.id]);

  const handleTriggerCheck = async (id) => {
    try {
      const res = await fetch(`/api/monitors/${id}/check`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setMonitors((prev) =>
          prev.map((m) => (m._id === id ? { ...m, ...data.monitor } : m))
        );
        const userId = session?.user?.id;
        if (userId) {
          const cached = dashboardCache.get(userId);
          if (cached) dashboardCache.set(userId, {
            ...cached,
            monitors: cached.monitors.map((monitor) => monitor._id === id ? { ...monitor, ...data.monitor } : monitor),
            updatedAt: Date.now(),
          });
        }
      }
    } catch (err) {
      console.error('Check run failed:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this monitor?')) return;
    try {
      const res = await fetch(`/api/monitors/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMonitors((prev) => prev.filter((m) => m._id !== id));
        const userId = session?.user?.id;
        if (userId) {
          const cached = dashboardCache.get(userId);
          if (cached) dashboardCache.set(userId, {
            ...cached,
            monitors: cached.monitors.filter((monitor) => monitor._id !== id),
            updatedAt: Date.now(),
          });
        }
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleCreated = (newMonitor) => {
    setMonitors((prev) => [newMonitor, ...prev]);
    const userId = session?.user?.id;
    if (userId) {
      const cached = dashboardCache.get(userId);
      if (cached) dashboardCache.set(userId, {
        ...cached,
        monitors: [newMonitor, ...(cached.monitors || [])],
        updatedAt: Date.now(),
      });
    }
  };

  const dismissAlertOnboarding = () => {
    setOnboardingDismissed(true);
    if (session?.user?.id) {
      window.sessionStorage.setItem(`alert-email-onboarding-dismissed:${session.user.id}`, '1');
    }
  };

  const handleAlertPreferenceSaved = (result) => {
    setAlertProfile((current) => ({
      ...current,
      alertEmailPreference: result.alertEmailPreference,
      effectiveAlertEmail: result.effectiveAlertEmail,
    }));
    setOnboardingDismissed(false);
    if (session?.user?.id) {
      window.sessionStorage.removeItem(`alert-email-onboarding-dismissed:${session.user.id}`);
    }
  };

  // Metrics summary
  const total = monitors.length;
  const healthy = monitors.filter((m) => m.status === 'HEALTHY').length;
  const breaking = monitors.filter((m) => m.status === 'BREAKING').length;
  const errors = monitors.filter((m) => m.status === 'ERROR').length;

  if (status === 'loading' || (loading && status === 'authenticated')) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-neutral-400 text-sm font-mono">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading ChronoGit telemetry...
          </div>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="inline-flex p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Activity className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">API Contract Drift Protection</h1>
              <p className="text-sm text-neutral-400 mt-2">
                Sign in to monitor external APIs, capture baseline contracts, and receive instant alerts on breaking schema changes.
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => signIn('google')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-neutral-900 font-medium text-sm hover:bg-neutral-200 transition"
              >
                Continue with Google
              </button>
              <button
                onClick={() => signIn('demo-login')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 font-medium text-sm hover:bg-neutral-800 transition"
              >
                Instant Demo Access (One-Click)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 space-y-8">
        {/* Top Header & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Monitored Endpoints</h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              Live schema-inference pipelines and breaking drift detectors.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchMonitors}
              className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold shadow-lg shadow-rose-500/20 transition"
            >
              <Plus className="w-4 h-4" /> Add Monitor
            </button>
          </div>
        </div>

        {/* Status Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl border border-neutral-800/80 bg-neutral-900/30">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400 block font-medium">Total</span>
            <div className="text-xl font-mono font-bold mt-1 text-white">{total}</div>
          </div>
          <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-emerald-400 block font-medium">Healthy</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-mono font-bold mt-1 text-emerald-400">{healthy}</div>
          </div>
          <div className="p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-rose-400 block font-medium">Breaking Drift</span>
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-xl font-mono font-bold mt-1 text-rose-400">{breaking}</div>
          </div>
          <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-amber-400 block font-medium">Errors</span>
              <XCircle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-mono font-bold mt-1 text-amber-400">{errors}</div>
          </div>
        </div>

        {/* Monitor Cards Grid */}
        {monitors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto text-neutral-400 mb-3">
              <Activity className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-white">No endpoints registered yet</h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
              Add your first API endpoint to record a baseline schema and start automated background checks.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-900 text-xs font-semibold hover:bg-white transition"
            >
              <Plus className="w-3.5 h-3.5" /> Register Endpoint
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {monitors.map((m) => (
              <MonitorCard
                key={m._id}
                monitor={m}
                onTriggerCheck={handleTriggerCheck}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      <AddMonitorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={handleCreated}
        effectiveAlertEmail={alertProfile?.effectiveAlertEmail || ''}
      />
      {alertProfile && !alertProfile.alertEmailPreference?.confirmedAt && !onboardingDismissed && (
        <AlertPreferenceModal
          accountEmail={session?.user?.email || alertProfile.email || ''}
          preference={alertProfile.alertEmailPreference}
          onSaved={handleAlertPreferenceSaved}
          onDismiss={dismissAlertOnboarding}
        />
      )}
    </div>
  );
}

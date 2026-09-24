'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession, signIn, signOut } from 'next-auth/react';
import { Activity, Bell, LogIn, LogOut, Settings } from 'lucide-react';

function severityClass(type) {
  if (type === 'BREAKING_DRIFT') return 'bg-rose-500/10 text-rose-300 border-rose-500/20';
  if (type === 'NON_BREAKING_DRIFT') return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
  return 'bg-orange-500/10 text-orange-300 border-orange-500/20';
}

function severityLabel(type) {
  if (type === 'BREAKING_DRIFT') return 'Breaking';
  if (type === 'NON_BREAKING_DRIFT') return 'Non-breaking';
  return 'Endpoint error';
}

export default function Navbar() {
  const { data: session } = useSession();
  const router = useRouter();
  const notificationRef = useRef(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const userId = session?.user?.id;

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    setLoadingNotifications(true);
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load notifications');
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      setNotificationError('');
    } catch (err) {
      setNotificationError(err.message || 'Could not load notifications');
    } finally {
      setLoadingNotifications(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      return undefined;
    }
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 60_000);
    return () => window.clearInterval(timer);
  }, [userId, loadNotifications]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function closeOnOutsideClick(event) {
      if (!notificationRef.current?.contains(event.target)) setIsOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  async function markAllRead() {
    setNotificationError('');
    try {
      const response = await fetch('/api/notifications', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not mark notifications as read');
      setNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      setNotificationError(err.message || 'Could not mark notifications as read');
    }
  }

  async function openNotification(notification) {
    if (!notification.isRead) {
      try {
        const response = await fetch(`/api/notifications/${notification._id}/read`, { method: 'PATCH' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not mark notification as read');
        setNotifications((items) => items.map((item) =>
          item._id === notification._id ? { ...item, isRead: true } : item
        ));
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch (err) {
        setNotificationError(err.message || 'Could not mark notification as read');
      }
    }
    setIsOpen(false);
    router.push(`/monitors/${notification.monitorId}`);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-rose-400 transition group-hover:border-rose-500/40">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <span className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-white">
              ChronoGit
              <span className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-neutral-400">v1.0</span>
            </span>
            <p className="hidden text-xs text-neutral-400 sm:block">API Contract Drift Engine</p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {session ? (
            <>
              <div className="relative" ref={notificationRef}>
                <button type="button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                  aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}
                  className="relative rounded-lg border border-transparent p-2 text-neutral-400 transition hover:border-neutral-700 hover:bg-neutral-800 hover:text-white">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                {isOpen && (
                  <section aria-label="Recent notifications"
                    className="absolute right-0 top-full mt-3 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                      <h2 className="text-sm font-semibold text-white">Notifications</h2>
                      <button type="button" onClick={markAllRead} disabled={!unreadCount}
                        className="text-xs text-neutral-400 hover:text-white disabled:cursor-default disabled:opacity-40">
                        Mark all as read
                      </button>
                    </div>
                    {notificationError && <p role="alert" className="px-4 pt-3 text-xs text-rose-400">{notificationError}</p>}
                    <div className="max-h-[min(70vh,28rem)] overflow-y-auto">
                      {loadingNotifications && notifications.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-neutral-400">Loading alerts…</p>
                      ) : notifications.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-neutral-400">No recent alerts</p>
                      ) : notifications.map((notification) => (
                        <button type="button" key={notification._id} onClick={() => openNotification(notification)}
                          className={`block w-full border-b border-neutral-800/80 px-4 py-3 text-left transition hover:bg-neutral-800/70 ${notification.isRead ? 'opacity-70' : 'bg-neutral-800/20'}`}>
                          <span className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-medium text-white">{notification.monitorName}</span>
                            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${severityClass(notification.type)}`}>
                              {severityLabel(notification.type)}
                            </span>
                          </span>
                          <span className="mt-1 block text-xs text-neutral-300">{notification.title}</span>
                          <span className="mt-1 block line-clamp-2 text-xs text-neutral-500">{notification.message}</span>
                          <time dateTime={notification.createdAt} className="mt-2 block text-[10px] text-neutral-500">
                            {notification.createdAt ? new Date(notification.createdAt).toLocaleString() : ''}
                          </time>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              <Link href="/settings" aria-label="Settings" title="Settings"
                className="rounded-lg border border-transparent p-2 text-neutral-400 transition hover:border-neutral-700 hover:bg-neutral-800 hover:text-white">
                <Settings className="h-4 w-4" />
              </Link>

              <div className="flex items-center gap-2.5 border-l border-neutral-800 pl-2">
                {session.user.image ? (
                  <img src={session.user.image} alt={session.user.name || 'User'} className="h-7 w-7 rounded-full border border-neutral-700" />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-700 bg-neutral-800 text-xs font-medium">
                    {session.user.name?.[0] || 'U'}
                  </div>
                )}
                <button onClick={() => signOut()} className="flex items-center gap-1 text-xs text-neutral-400 transition hover:text-rose-400">
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            </>
          ) : (
            <button onClick={() => signIn('demo-login')}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-100 px-3.5 py-1.5 text-xs font-semibold text-neutral-900 transition hover:bg-white">
              <LogIn className="h-3.5 w-3.5" /> Sign In (Demo)
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

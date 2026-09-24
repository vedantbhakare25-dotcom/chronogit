'use client';

import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';
import { Activity, Bell, LogIn, LogOut } from 'lucide-react';

export default function Navbar() {
  const { data: session } = useSession();

  return (
    <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 group-hover:border-rose-500/40 transition">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="font-semibold tracking-tight text-white flex items-center gap-1.5 text-base">
              ChronoGit
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                v1.0
              </span>
            </span>
            <p className="text-xs text-neutral-400 hidden sm:block">API Contract Drift Engine</p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {session ? (
            <>
              <Link
                href="/settings"
                className="p-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 border border-transparent hover:border-neutral-700 transition"
                title="Alert Email Settings"
              >
                <Bell className="w-4 h-4" />
              </Link>

              <div className="flex items-center gap-2.5 pl-2 border-l border-neutral-800">
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt={session.user.name || 'User'}
                    className="w-7 h-7 rounded-full border border-neutral-700"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-medium">
                    {session.user.name?.[0] || 'U'}
                  </div>
                )}
                <button
                  onClick={() => signOut()}
                  className="text-xs text-neutral-400 hover:text-rose-400 transition flex items-center gap-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => signIn('demo-login')}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-neutral-100 text-neutral-900 text-xs font-semibold hover:bg-white transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In (Demo)
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
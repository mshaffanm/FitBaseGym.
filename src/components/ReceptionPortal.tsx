import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarCheck,
  Fingerprint,
  KeyRound,
  LogOut,
  Menu,
  Users,
  X,
} from 'lucide-react';
import { BrandRoleCredits, FitBaseLogo } from './Brand';
import { ReceptionWorkspace, type ReceptionSubView } from './ReceptionWorkspace';
import type { UserProfile } from '../types';

interface ReceptionPortalProps {
  currentUser: UserProfile;
  onBackToSite: () => void;
  onSignOut: () => void;
}

export function ReceptionPortal({
  currentUser,
  onBackToSite,
  onSignOut,
}: ReceptionPortalProps) {
  const [activeView, setActiveView] = useState<ReceptionSubView>('checkin');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems: Array<{ id: ReceptionSubView; label: string; icon: typeof Fingerprint }> = [
    { id: 'checkin', label: 'Biometric Check-In', icon: Fingerprint },
    { id: 'dues', label: 'Pending Dues & Alerts', icon: AlertTriangle },
    { id: 'profiles', label: 'Member Profiles', icon: Users },
    { id: 'resets', label: 'Password Resets', icon: KeyRound },
    { id: 'attendance', label: 'Attendance Ledger', icon: CalendarCheck },
    { id: 'notifications', label: 'Renewals & WhatsApp', icon: Bell },
  ];

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 lg:flex">
      {/* Mobile Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-[#0D0D10] px-4 py-3 lg:hidden">
        <div className="flex items-center gap-3">
          <FitBaseLogo size="sm" />
          <div>
            <span className="block font-display text-xl font-bold tracking-wide text-white leading-none">
              FIT<span className="text-red-500">BASE</span>
            </span>
            <BrandRoleCredits variant="inline" className="mt-0.5" />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen((s) => !s)}
          aria-label="Toggle reception navigation"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-800 text-zinc-300"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Left Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'block' : 'hidden'
        } w-full shrink-0 border-b border-zinc-800 bg-[#0D0D10] lg:block lg:w-64 lg:border-b-0 lg:border-r`}
      >
        <div className="flex h-full flex-col justify-between p-5">
          <div>
            <div className="hidden lg:flex items-center gap-3 pb-6 border-b border-zinc-800">
              <FitBaseLogo size="sm" />
              <div className="min-w-0">
                <p className="font-display text-xl font-bold tracking-wide text-white leading-none truncate">
                  FIT<span className="text-red-500">BASE</span>
                </p>
                <BrandRoleCredits className="mt-1" />
                <p className="mt-1 text-xs text-yellow-400">Reception Desk</p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-zinc-800 bg-[#121216] p-3.5">
              <p className="text-sm font-semibold text-white truncate">{currentUser.name}</p>
              <p className="mt-0.5 text-xs text-zinc-400">Front Desk Operations</p>
              <p className="mt-1 font-mono text-[11px] text-zinc-500">{currentUser.memberCode}</p>
            </div>

            <nav aria-label="Reception sections" className="mt-6 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveView(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-red-600 text-white'
                        : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="mt-8 space-y-2 border-t border-zinc-800 pt-4">
            <button
              type="button"
              onClick={onBackToSite}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-900 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Public Site</span>
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-900 hover:text-red-400"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 border-b border-zinc-800 pb-5">
            <p className="text-xs text-zinc-400">
              FitBase Front Desk <span aria-hidden="true">/</span>{' '}
              <span className="text-zinc-200">
                {navItems.find((i) => i.id === activeView)?.label}
              </span>
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold text-white">
              Reception &amp; Biometric Operations
            </h1>
          </div>

          <ReceptionWorkspace activeView={activeView} onChangeView={setActiveView} />
        </div>
      </main>
    </div>
  );
}

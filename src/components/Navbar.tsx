import { useState } from 'react';
import { Fingerprint, Menu, ShieldCheck, UserCheck, X } from 'lucide-react';
import { BrandRoleCredits, FitBaseLogo } from './Brand';
import type { PortalTarget, UserProfile } from '../types';

interface NavbarProps {
  currentUser: UserProfile | null;
  onOpenPortal: (targetPortal?: PortalTarget) => void;
  onNavigateSection: (sectionId: string) => void;
}

export function Navbar({ currentUser, onOpenPortal, onNavigateSection }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'facility', label: 'Facility' },
    { id: 'schedule', label: 'Schedule' },
    { id: 'memberships', label: 'Memberships' },
    { id: 'coaching', label: 'Coaching' },
  ];

  const handleLinkClick = (id: string) => {
    setMobileMenuOpen(false);
    onNavigateSection(id);
  };

  const handlePortalClick = (target: PortalTarget) => {
    setMobileMenuOpen(false);
    onOpenPortal(target);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#09090B]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <button
            type="button"
            onClick={() => onNavigateSection('top')}
            aria-label="FitBase Home"
            className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <FitBaseLogo size="sm" />
          </button>
          <div className="flex flex-col justify-center leading-none">
            <button
              type="button"
              onClick={() => onNavigateSection('top')}
              className="text-left font-display text-xl font-bold tracking-wide text-white leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
            >
              FIT<span className="text-red-500">BASE</span>
            </button>
            <BrandRoleCredits variant="inline" className="mt-0.5" />
          </div>
        </div>

        <nav
          aria-label="Primary navigation"
          className="hidden lg:flex items-center gap-6 text-sm font-medium text-zinc-400"
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleLinkClick(item.id)}
              className="whitespace-nowrap shrink-0 py-1 text-zinc-300 transition-colors hover:text-white hover:underline underline-offset-8 decoration-red-500 decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handlePortalClick('member')}
            className={`hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${
              currentUser?.role === 'member'
                ? 'bg-red-600 text-white ring-1 ring-red-400'
                : 'bg-red-600 text-white hover:bg-red-500'
            }`}
          >
            <UserCheck className="h-3.5 w-3.5 shrink-0" />
            <span>{currentUser?.role === 'member' ? 'My Member Portal' : 'Member Portal'}</span>
          </button>

          <button
            type="button"
            onClick={() => handlePortalClick('reception')}
            className={`hidden md:inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              currentUser?.role === 'reception'
                ? 'border-amber-400 bg-amber-500 text-zinc-950'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:border-amber-400 hover:bg-amber-500/20'
            }`}
          >
            <Fingerprint className="h-3.5 w-3.5 shrink-0" />
            <span>Reception Portal</span>
          </button>

          <button
            type="button"
            onClick={() => handlePortalClick('admin')}
            className={`hidden md:inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 ${
              currentUser?.role === 'admin'
                ? 'border-white bg-zinc-100 text-zinc-950'
                : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500 hover:text-white'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span>Admin Portal</span>
          </button>

          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-800 text-zinc-300 hover:bg-zinc-900 lg:hidden"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-zinc-800 bg-[#0D0D10] px-4 py-4 lg:hidden">
          <div className="flex flex-col gap-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleLinkClick(item.id)}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-left text-sm font-medium text-zinc-200 hover:bg-zinc-900"
              >
                {item.label}
              </button>
            ))}
            <div className="mt-2 grid grid-cols-1 gap-2 border-t border-zinc-800 pt-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => handlePortalClick('member')}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-500"
              >
                <UserCheck className="h-4 w-4" />
                <span>Member Portal</span>
              </button>
              <button
                type="button"
                onClick={() => handlePortalClick('reception')}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
              >
                <Fingerprint className="h-4 w-4" />
                <span>Reception Portal</span>
              </button>
              <button
                type="button"
                onClick={() => handlePortalClick('admin')}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-100 hover:border-zinc-500"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Admin Portal</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

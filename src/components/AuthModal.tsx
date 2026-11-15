import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Lock,
  ShieldCheck,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { api, setAuthToken } from '../api';
import { BrandRoleCredits, FitBaseLogo } from './Brand';
import type { MembershipTier, PortalTarget, UserProfile } from '../types';

interface AuthModalProps {
  initialMode?: 'login' | 'register';
  initialPortal?: PortalTarget;
  initialError?: string;
  preselectedTier?: MembershipTier;
  onClose: () => void;
  onAuthenticated: (user: UserProfile) => void;
}

const PORTAL_META: Record<
  PortalTarget,
  {
    label: string;
    shortLabel: string;
    subtitle: string;
    accentClass: string;
    placeholderEmail: string;
  }
> = {
  member: {
    label: 'Member Portal',
    shortLabel: 'Member',
    subtitle: 'Personal workouts, attendance logs, class bookings & JazzCash/EasyPaisa slips',
    accentClass: 'bg-red-600 text-white',
    placeholderEmail: 'you@example.com',
  },
  reception: {
    label: 'Reception Portal',
    shortLabel: 'Reception',
    subtitle: 'Biometric scanner desk, pending dues clearance & member password resets',
    accentClass: 'bg-amber-500 text-zinc-950',
    placeholderEmail: 'staff@fitbasegym.pk',
  },
  admin: {
    label: 'Admin Portal',
    shortLabel: 'Admin',
    subtitle: 'Owner console (TAMHEED) · Fee approvals, trainer management & member feedback',
    accentClass: 'bg-zinc-100 text-zinc-950',
    placeholderEmail: 'owner@fitbasegym.pk',
  },
};

export function AuthModal({
  initialMode = 'login',
  initialPortal = 'member',
  initialError = '',
  preselectedTier = 'Official Package',
  onClose,
  onAuthenticated,
}: AuthModalProps) {
  const [selectedPortal, setSelectedPortal] = useState<PortalTarget>(initialPortal);
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(
    initialPortal === 'member' ? initialMode : 'login'
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regTier, setRegTier] = useState<MembershipTier>(preselectedTier);

  // Member Forgot Password -> Reception Reset Request
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetPhone, setResetPhone] = useState('');
  const [resetNote, setResetNote] = useState('');
  const [resetSuccess, setResetSuccess] = useState<{
    id: string;
    memberCode: string;
    memberName: string;
    message: string;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

  useEffect(() => {
    setSelectedPortal(initialPortal);
    setMode(initialPortal === 'member' ? initialMode : 'login');
    setError(initialError || '');
    setResetSuccess(null);
  }, [initialPortal, initialMode, initialError]);

  const handleSelectPortal = (portal: PortalTarget) => {
    setSelectedPortal(portal);
    if (portal !== 'member') {
      setMode('login');
    }
    setError('');
    setResetSuccess(null);
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      setError(msg);
      if (msg.toLowerCase().includes('membership expired')) {
        setAuthToken(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.register({
        name: regName,
        email,
        phone: regPhone,
        password,
        membershipTier: regTier,
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.requestPasswordReset({
        identifier: resetIdentifier,
        phone: resetPhone,
        note: resetNote,
      });
      setResetSuccess({
        id: res.request.id,
        memberCode: res.request.memberCode,
        memberName: res.request.memberName,
        message: res.message,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit reset request.');
    } finally {
      setLoading(false);
    }
  };

  const meta = PORTAL_META[selectedPortal];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="FitBase Portal Authentication"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
    >
      <div className="my-auto w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#111114] p-6 sm:p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <FitBaseLogo size="sm" />
            <div>
              <h2 className="font-display text-2xl font-bold tracking-wide text-white leading-none">
                FIT<span className="text-red-500">BASE</span> · {meta.label.toUpperCase()}
              </h2>
              <BrandRoleCredits className="mt-1" />
              <p className="mt-1 text-xs text-zinc-400">{meta.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Direct 3-Portal Selector */}
        <div className="mt-5 grid grid-cols-3 gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 p-1.5">
          <button
            type="button"
            onClick={() => handleSelectPortal('member')}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              selectedPortal === 'member'
                ? 'bg-red-600 text-white'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
            }`}
          >
            <UserCheck className="h-3.5 w-3.5 shrink-0" />
            <span>Member Portal</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectPortal('reception')}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              selectedPortal === 'reception'
                ? 'bg-amber-500 text-zinc-950'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
            }`}
          >
            <Fingerprint className="h-3.5 w-3.5 shrink-0" />
            <span>Reception Portal</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectPortal('admin')}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              selectedPortal === 'admin'
                ? 'bg-zinc-100 text-zinc-950'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span>Admin Portal</span>
          </button>
        </div>

        {/* Member Sub-Mode Switcher */}
        {selectedPortal === 'member' && mode !== 'forgot' && (
          <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`flex items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-colors ${
                mode === 'login' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Member Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className={`flex items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-colors ${
                mode === 'register' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>New Member</span>
            </button>
          </div>
        )}

        {/* MEMBER FORGOT PASSWORD FLOW */}
        {selectedPortal === 'member' && mode === 'forgot' ? (
          <div className="mt-5 space-y-4">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
                setResetSuccess(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Member Sign In</span>
            </button>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
              <div className="flex items-start gap-2.5">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div>
                  <p className="text-xs font-semibold text-white">
                    Request Password Reset via Reception Desk
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-300">
                    Submit your account details below. Your reset request appears immediately inside
                    the FitBase Reception Portal so front-desk staff can issue a temporary password
                    in person or via WhatsApp.
                  </p>
                </div>
              </div>
            </div>

            {resetSuccess ? (
              <div className="space-y-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Reset Request Sent to Reception Desk
                    </p>
                    <p className="mt-1 text-xs text-zinc-200">{resetSuccess.message}</p>
                    <p className="mt-2 font-mono text-[11px] text-emerald-300">
                      Ticket: {resetSuccess.id} · {resetSuccess.memberName} (
                      {resetSuccess.memberCode})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setResetSuccess(null);
                    setError('');
                  }}
                  className="w-full rounded-lg bg-zinc-100 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-white"
                >
                  Return to Member Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-3.5">
                <div>
                  <label htmlFor="reset-ident" className="block text-xs font-medium text-zinc-300">
                    Registered Email or Member Code
                  </label>
                  <input
                    id="reset-ident"
                    type="text"
                    required
                    value={resetIdentifier}
                    onChange={(e) => setResetIdentifier(e.target.value)}
                    placeholder="Email address or Member ID (e.g. FB-1001)"
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-red-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="reset-phone" className="block text-xs font-medium text-zinc-300">
                    Phone Number (For Staff Verification)
                  </label>
                  <input
                    id="reset-phone"
                    type="tel"
                    required
                    value={resetPhone}
                    onChange={(e) => setResetPhone(e.target.value)}
                    placeholder="+92 3XX XXXXXXX"
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-red-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="reset-note" className="block text-xs font-medium text-zinc-300">
                    Optional Note for Reception
                  </label>
                  <input
                    id="reset-note"
                    type="text"
                    value={resetNote}
                    onChange={(e) => setResetNote(e.target.value)}
                    placeholder="e.g., Need temporary password on WhatsApp"
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-red-500 focus:outline-none"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-xs font-medium text-red-300"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-400 disabled:opacity-60"
                >
                  {loading ? 'Sending Request to Reception...' : 'Send Reset Request to Reception'}
                </button>
              </form>
            )}
          </div>
        ) : mode === 'login' ? (
          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-zinc-300">
                {selectedPortal === 'admin'
                  ? 'Admin Email Address'
                  : selectedPortal === 'reception'
                    ? 'Staff Desk Email'
                    : 'Member Email Address'}
              </label>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={meta.placeholderEmail}
                className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-red-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="auth-pass" className="block text-xs font-medium text-zinc-300">
                  Password
                </label>
                {selectedPortal === 'member' && (
                  <button
                    type="button"
                    onClick={() => {
                      setResetIdentifier(email);
                      setError('');
                      setResetSuccess(null);
                      setMode('forgot');
                    }}
                    className="text-xs font-medium text-amber-400 hover:text-amber-300 hover:underline underline-offset-4"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <input
                id="auth-pass"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-red-500 focus:outline-none"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-xs font-semibold text-red-300"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                <div>
                  <p>{error}</p>
                  {error === 'Membership Expired.' && (
                    <p className="mt-1 font-normal text-red-200/80">
                      Please renew your package at FitBase Reception (0312-8330203) to restore Member
                      Portal access.
                    </p>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
                selectedPortal === 'reception'
                  ? 'bg-amber-500 text-zinc-950 hover:bg-amber-400'
                  : selectedPortal === 'admin'
                    ? 'bg-zinc-100 text-zinc-950 hover:bg-white'
                    : 'bg-red-600 text-white hover:bg-red-500'
              }`}
            >
              {loading ? 'Signing in...' : `Sign In to ${meta.label}`}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="mt-5 space-y-3.5">
            <div>
              <label htmlFor="reg-name" className="block text-xs font-medium text-zinc-300">
                Full Name
              </label>
              <input
                id="reg-name"
                type="text"
                required
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="Full name"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="reg-email" className="block text-xs font-medium text-zinc-300">
                  Email
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="reg-phone" className="block text-xs font-medium text-zinc-300">
                  Phone Number
                </label>
                <input
                  id="reg-phone"
                  type="tel"
                  required
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="+92 3XX XXXXXXX"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-tier" className="block text-xs font-medium text-zinc-300">
                Membership Plan
              </label>
              <select
                id="reg-tier"
                value={regTier}
                onChange={(e) => setRegTier(e.target.value as MembershipTier)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
              >
                <option value="Student Package">Student Package (Student ID) — PKR 6,000 / month</option>
                <option value="Official Package">Official Package — PKR 7,000 / month</option>
                <option value="3 Months Package">3 Months Package — PKR 16,000 total</option>
                <option value="6 Months Package">6 Months Package (Best Value) — PKR 30,000 total</option>
                <option value="12 Months Package">12 Months Package (Best Deal) — PKR 50,000 total</option>
              </select>
            </div>

            <div>
              <label htmlFor="reg-pass" className="block text-xs font-medium text-zinc-300">
                Create Password (min 6 characters)
              </label>
              <input
                id="reg-pass"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-xs font-medium text-red-300"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-60"
            >
              {loading ? 'Creating account...' : 'Register & Enter Member Portal'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

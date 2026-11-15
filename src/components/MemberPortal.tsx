import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarCheck,
  CreditCard,
  Dumbbell,
  Eye,
  FileUp,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api';
import {
  BrandRoleCredits,
  FeeStatusText,
  FitBaseLogo,
  formatDateTime,
  formatPkr,
  formatShortDate,
  PaymentStatusText,
} from './Brand';
import type {
  MemberDashboardPayload,
  PaymentMethod,
  PaymentSubmission,
  UserProfile,
} from '../types';

interface MemberPortalProps {
  currentUser: UserProfile;
  onUserUpdated: (user: UserProfile) => void;
  onMembershipExpired?: () => void;
  onBackToSite: () => void;
  onSignOut: () => void;
}

type MemberTab =
  | 'overview'
  | 'performance'
  | 'attendance'
  | 'payments'
  | 'classes'
  | 'feedback';

const PAYMENT_CHANNELS: Record<
  PaymentMethod,
  { title: string; accountLabel: string; accountValue: string; instruction: string }
> = {
  JazzCash: {
    title: 'JazzCash Mobile Account',
    accountLabel: 'JazzCash Till / Mobile',
    accountValue: '0312-8330203 (TAMHEED · FitBase Fitness)',
    instruction: 'Send fee via JazzCash App and upload the confirmation screenshot with TID.',
  },
  EasyPaisa: {
    title: 'EasyPaisa Wallet',
    accountLabel: 'EasyPaisa Account',
    accountValue: '0319-7663203 (FitBase Fitness Center)',
    instruction: 'Transfer via EasyPaisa and attach the receipt screenshot showing Transaction ID.',
  },
  'Bank Transfer': {
    title: 'Meezan Bank IBFT / Raast',
    accountLabel: 'IBAN / Account',
    accountValue: 'PK36MEZN0002140104829103',
    instruction: 'Transfer via IBFT or Raast and upload the bank transfer confirmation slip.',
  },
  Cash: {
    title: 'Front Desk Cash Receipt',
    accountLabel: 'Receipt Desk',
    accountValue: 'Near Marhaba Mart, Green Avenue, East Canal Road, Faisalabad',
    instruction: 'Enter your paper receipt number issued by the front desk (photo optional).',
  },
};

function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentMonthIso(): string {
  return new Date().toISOString().slice(0, 7);
}

function getPlusDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function MemberPortal({
  currentUser,
  onUserUpdated,
  onMembershipExpired,
  onBackToSite,
  onSignOut,
}: MemberPortalProps) {
  const [activeTab, setActiveTab] = useState<MemberTab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<MemberDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Check-in state
  const [checkInZone, setCheckInZone] = useState('Main Iron Rack Bay');
  const [checkInBusy, setCheckInBusy] = useState(false);

  // Performance log form
  const [selectedMetricChart, setSelectedMetricChart] = useState<string>('');
  const [perfDate, setPerfDate] = useState(getTodayIso);
  const [perfMetric, setPerfMetric] = useState('Back Squat 1RM');
  const [perfCategory, setPerfCategory] = useState<'Strength Lift' | 'Conditioning' | 'Body Composition'>('Strength Lift');
  const [perfValue, setPerfValue] = useState('');
  const [perfUnit, setPerfUnit] = useState('kg');
  const [perfNotes, setPerfNotes] = useState('');

  // Goal form
  const [goalTitle, setGoalTitle] = useState('');
  const [goalMetric, setGoalMetric] = useState('');
  const [goalStart, setGoalStart] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalUnit, setGoalUnit] = useState('kg');
  const [goalDeadline, setGoalDeadline] = useState(() => getPlusDaysIso(30));
  const [goalProgressEdits, setGoalProgressEdits] = useState<Record<string, string>>({});

  // Payment form
  const [payMethod, setPayMethod] = useState<PaymentMethod>('JazzCash');
  const [payMonth, setPayMonth] = useState(getCurrentMonthIso);
  const [payAmount, setPayAmount] = useState(String(currentUser.monthlyFeePkr || 7000));
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payFile, setPayFile] = useState<File | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [previewReceipt, setPreviewReceipt] = useState<PaymentSubmission | null>(null);

  // Feedback form
  const [fbCategory, setFbCategory] = useState<'Equipment' | 'Trainer' | 'Facility' | 'Billing'>('Facility');
  const [fbTrainerId, setFbTrainerId] = useState('');
  const [fbRating, setFbRating] = useState(5);
  const [fbMessage, setFbMessage] = useState('');
  const [fbBusy, setFbBusy] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  };

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await api.getMemberDashboard();
      setData(payload);
      onUserUpdated(payload.profile);
      setPayAmount(String(payload.profile.monthlyFeePkr || 7000));
      if (!selectedMetricChart && payload.performanceLogs.length > 0) {
        setSelectedMetricChart(payload.performanceLogs[0].metric);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to load dashboard.';
      if (msg.includes('Membership Expired')) {
        onMembershipExpired?.();
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [onMembershipExpired, onUserUpdated, selectedMetricChart]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const metricNames = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.performanceLogs.map((l) => l.metric)));
  }, [data]);

  const chartSeries = useMemo(() => {
    if (!data) return [];
    const metric = selectedMetricChart || metricNames[0] || '';
    return data.performanceLogs
      .filter((l) => l.metric === metric)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data, metricNames, selectedMetricChart]);

  const handleActionError = (err: unknown, fallback: string) => {
    const msg = err instanceof Error ? err.message : fallback;
    if (msg.includes('Membership Expired')) {
      onMembershipExpired?.();
      return;
    }
    showToast(msg);
  };

  const handleCheckIn = async () => {
    setCheckInBusy(true);
    try {
      await api.checkInMember(checkInZone);
      await fetchDashboard();
      showToast(`Checked in to ${checkInZone}.`);
    } catch (err) {
      handleActionError(err, 'Check-in failed.');
    } finally {
      setCheckInBusy(false);
    }
  };

  const handleAddPerformance = async (e: FormEvent) => {
    e.preventDefault();
    const numericVal = Number(perfValue);
    if (!perfMetric.trim() || Number.isNaN(numericVal)) {
      showToast('Enter a valid metric and numeric value.');
      return;
    }
    try {
      await api.addPerformanceLog({
        date: perfDate,
        metric: perfMetric,
        category: perfCategory,
        value: numericVal,
        unit: perfUnit,
        notes: perfNotes,
      });
      setSelectedMetricChart(perfMetric.trim());
      setPerfValue('');
      setPerfNotes('');
      await fetchDashboard();
      showToast('Performance entry logged.');
    } catch (err) {
      handleActionError(err, 'Could not save entry.');
    }
  };

  const handleDeletePerformance = async (id: string) => {
    try {
      await api.deletePerformanceLog(id);
      await fetchDashboard();
      showToast('Entry removed.');
    } catch (err) {
      handleActionError(err, 'Delete failed.');
    }
  };

  const handleCreateGoal = async (e: FormEvent) => {
    e.preventDefault();
    const startVal = Number(goalStart) || 0;
    const targetVal = Number(goalTarget);
    if (!goalTitle.trim() || !goalMetric.trim() || Number.isNaN(targetVal)) {
      showToast('Fill in goal title, metric, and target value.');
      return;
    }
    try {
      await api.createGoal({
        title: goalTitle,
        metric: goalMetric,
        startValue: startVal,
        currentValue: startVal,
        targetValue: targetVal,
        unit: goalUnit,
        deadline: goalDeadline,
      });
      setGoalTitle('');
      setGoalMetric('');
      setGoalStart('');
      setGoalTarget('');
      await fetchDashboard();
      showToast('New training goal created.');
    } catch (err) {
      handleActionError(err, 'Could not create goal.');
    }
  };

  const handleUpdateGoal = async (goalId: string, status?: 'Active' | 'Achieved') => {
    const edited = goalProgressEdits[goalId];
    const currentValue = edited !== undefined && edited !== '' ? Number(edited) : undefined;
    try {
      await api.updateGoal(goalId, { currentValue, status });
      await fetchDashboard();
      showToast('Goal progress updated.');
    } catch (err) {
      handleActionError(err, 'Update failed.');
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    try {
      await api.deleteGoal(goalId);
      await fetchDashboard();
      showToast('Goal deleted.');
    } catch (err) {
      handleActionError(err, 'Delete failed.');
    }
  };

  const handleSubmitPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!payRef.trim()) {
      showToast('Transaction Reference ID is required.');
      return;
    }
    if (payMethod !== 'Cash' && !payFile) {
      showToast('Please attach a payment receipt screenshot or PDF.');
      return;
    }

    setPayBusy(true);
    try {
      const formData = new FormData();
      formData.append('method', payMethod);
      formData.append('transactionRef', payRef.trim());
      formData.append('billingMonth', payMonth);
      formData.append('amountPkr', payAmount);
      formData.append('notes', payNotes);
      if (payFile) {
        formData.append('receipt', payFile);
      }
      await api.submitPayment(formData);
      setPayRef('');
      setPayNotes('');
      setPayFile(null);
      await fetchDashboard();
      showToast('Payment receipt uploaded and sent for Admin verification.');
    } catch (err) {
      handleActionError(err, 'Payment upload failed.');
    } finally {
      setPayBusy(false);
    }
  };

  const handleToggleClass = async (classId: string) => {
    try {
      const res = await api.toggleClassBooking(classId);
      await fetchDashboard();
      showToast(res.booked ? 'Class spot reserved.' : 'Class reservation cancelled.');
    } catch (err) {
      handleActionError(err, 'Unable to update booking.');
    }
  };

  const handleSubmitFeedback = async (e: FormEvent) => {
    e.preventDefault();
    if (!fbMessage.trim()) {
      showToast('Please enter your feedback message.');
      return;
    }
    setFbBusy(true);
    try {
      await api.submitMemberFeedback({
        category: fbCategory,
        trainerId: fbCategory === 'Trainer' && fbTrainerId ? fbTrainerId : undefined,
        rating: fbRating,
        message: fbMessage,
      });
      setFbMessage('');
      await fetchDashboard();
      showToast('Feedback submitted to FitBase management.');
    } catch (err) {
      handleActionError(err, 'Feedback submission failed.');
    } finally {
      setFbBusy(false);
    }
  };

  const navItems: Array<{ id: MemberTab; label: string; icon: typeof Activity }> = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'performance', label: 'Performance & Goals', icon: Target },
    { id: 'attendance', label: 'Attendance Logs', icon: CalendarCheck },
    { id: 'payments', label: 'Fee & Payment Upload', icon: CreditCard },
    { id: 'classes', label: 'Class Bookings', icon: Dumbbell },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare },
  ];

  const profile = data?.profile || currentUser;
  const bookedClasses = useMemo(
    () => (data ? data.classes.filter((c) => c.bookedMemberIds.includes(profile.id)) : []),
    [data, profile.id]
  );

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
          aria-label="Toggle member portal navigation"
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
                <p className="mt-1 text-xs text-zinc-400">Member Portal</p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-zinc-800 bg-[#121216] p-3.5">
              <p className="text-sm font-semibold text-white truncate">{profile.name}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400 font-mono">
                <span>{profile.memberCode}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{profile.membershipTier}</span>
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-zinc-800">
                <FeeStatusText status={profile.feeStatus} />
              </div>
            </div>

            <nav aria-label="Member sections" className="mt-6 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
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
        <div className="mx-auto max-w-5xl">
          {/* Top Breadcrumb Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-5">
            <div>
              <p className="text-xs text-zinc-400">
                FitBase Member Portal <span aria-hidden="true">/</span>{' '}
                <span className="text-zinc-200">
                  {navItems.find((i) => i.id === activeTab)?.label}
                </span>
              </p>
              <h1 className="mt-1 font-display text-3xl font-bold text-white">
                {navItems.find((i) => i.id === activeTab)?.label}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <select
                aria-label="Select training zone for check-in"
                value={checkInZone}
                onChange={(e) => setCheckInZone(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-[#111114] px-3 py-2 text-xs text-zinc-200 focus:border-red-500 focus:outline-none"
              >
                <option value="Main Iron Rack Bay">Main Iron Rack Bay</option>
                <option value="Sprint Turf Track">Sprint Turf Track</option>
                <option value="Platform Bay B">Platform Bay B</option>
                <option value="Combat Studio">Combat Studio</option>
              </select>
              <button
                type="button"
                disabled={checkInBusy}
                onClick={handleCheckIn}
                className="rounded-lg bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-950 transition-colors hover:bg-white whitespace-nowrap shrink-0"
              >
                {checkInBusy ? 'Logging...' : 'Log Check-In'}
              </button>
            </div>
          </div>

          {toast && (
            <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-xs font-medium text-white">
              {toast}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
              {error}
            </div>
          )}

          {loading && !data ? (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-24 animate-pulse rounded-xl border border-zinc-800 bg-[#111114]"
                />
              ))}
            </div>
          ) : data ? (
            <div className="mt-6 space-y-8">
              {/* OVERVIEW TAB */}
              {activeTab === 'overview' && (
                <>
                  {data.expirationAlert && data.expirationAlert.status !== 'Active' && (
                    <div
                      role="alert"
                      className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5 ${
                        data.expirationAlert.status === 'Expired'
                          ? 'border-red-500/50 bg-red-500/10'
                          : 'border-amber-500/40 bg-amber-500/10'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle
                          className={`mt-0.5 h-5 w-5 shrink-0 ${
                            data.expirationAlert.status === 'Expired'
                              ? 'text-red-400'
                              : 'text-amber-400'
                          }`}
                        />
                        <div>
                          <p className="text-sm font-semibold text-white">
                            Subscription {data.expirationAlert.status} · Ends{' '}
                            {formatShortDate(data.expirationAlert.subscriptionEndDate)}
                          </p>
                          <p className="mt-0.5 text-xs text-zinc-300">
                            {data.expirationAlert.message}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('payments')}
                        className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 whitespace-nowrap shrink-0"
                      >
                        Renew Membership Now
                      </button>
                    </div>
                  )}

                  {profile.feeStatus !== 'Paid' && (
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          Monthly Fee Status: {profile.feeStatus}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-400">
                          {profile.feeStatus === 'Pending Verification'
                            ? 'Your receipt is queued with FitBase Admin for transaction matching.'
                            : `Upload your JazzCash, EasyPaisa, Bank Transfer, or Cash slip for ${formatPkr(
                                profile.monthlyFeePkr
                              )}.`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('payments')}
                        className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 whitespace-nowrap shrink-0"
                      >
                        Verify / Upload Payment
                      </button>
                    </div>
                  )}

                  {/* 4-Column KPI Strip */}
                  <div className="grid grid-cols-1 divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-[#111114] sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
                    <div className="p-5">
                      <p className="text-xs text-zinc-400">Monthly Fee Status</p>
                      <div className="mt-2">
                        <FeeStatusText status={profile.feeStatus} />
                      </div>
                      <p className="mt-1.5 font-mono text-xs text-zinc-500 tabular-nums">
                        Ends {formatShortDate(profile.subscriptionEndDate)}
                      </p>
                    </div>

                    <div className="p-5">
                      <p className="text-xs text-zinc-400">Attendance Logs</p>
                      <p className="mt-1.5 font-mono text-2xl font-bold text-white tabular-nums">
                        {data.attendanceLogs.length}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">Recorded gym check-ins</p>
                    </div>

                    <div className="p-5">
                      <p className="text-xs text-zinc-400">Active Goals</p>
                      <p className="mt-1.5 font-mono text-2xl font-bold text-white tabular-nums">
                        {data.goals.filter((g) => g.status === 'Active').length}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {data.goals.filter((g) => g.status === 'Achieved').length} achieved
                      </p>
                    </div>

                    <div className="p-5">
                      <p className="text-xs text-zinc-400">Booked Classes</p>
                      <p className="mt-1.5 font-mono text-2xl font-bold text-white tabular-nums">
                        {bookedClasses.length}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">Reserved this week</p>
                    </div>
                  </div>

                  {/* Two-column Summary: Goals + Recent Attendance */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="rounded-xl border border-zinc-800 bg-[#111114] p-6">
                      <div className="flex items-center justify-between">
                        <h2 className="font-display text-xl font-bold text-white">
                          Goal Progress
                        </h2>
                        <button
                          type="button"
                          onClick={() => setActiveTab('performance')}
                          className="text-xs font-medium text-red-400 hover:text-red-300"
                        >
                          Manage Goals
                        </button>
                      </div>
                      <div className="mt-4 space-y-4">
                        {data.goals.length === 0 ? (
                          <p className="text-sm text-zinc-400">
                            No goals configured yet. Set a target inside Performance &amp; Goals.
                          </p>
                        ) : (
                          data.goals.slice(0, 3).map((goal) => {
                            const span = Math.abs(goal.targetValue - goal.startValue) || 1;
                            const done = Math.abs(goal.currentValue - goal.startValue);
                            const pct =
                              goal.status === 'Achieved'
                                ? 100
                                : Math.min(100, Math.max(0, Math.round((done / span) * 100)));
                            return (
                              <div key={goal.id} className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-medium text-zinc-200">{goal.title}</span>
                                  <span className="font-mono text-zinc-400 tabular-nums">
                                    {goal.currentValue} / {goal.targetValue} {goal.unit}
                                  </span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                                  <div
                                    className={`h-full rounded-full ${
                                      goal.status === 'Achieved' ? 'bg-emerald-500' : 'bg-red-600'
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-800 bg-[#111114] p-6">
                      <div className="flex items-center justify-between">
                        <h2 className="font-display text-xl font-bold text-white">
                          Recent Check-Ins
                        </h2>
                        <button
                          type="button"
                          onClick={() => setActiveTab('attendance')}
                          className="text-xs font-medium text-red-400 hover:text-red-300"
                        >
                          Full Log
                        </button>
                      </div>
                      <div className="mt-4 divide-y divide-zinc-800/80">
                        {data.attendanceLogs.length === 0 ? (
                          <p className="text-sm text-zinc-400">No check-ins recorded yet.</p>
                        ) : (
                          data.attendanceLogs.slice(0, 4).map((log) => (
                            <div key={log.id} className="flex items-center justify-between py-3 text-xs">
                              <div>
                                <p className="font-medium text-zinc-200">{log.zoneOrClass}</p>
                                <p className="text-zinc-500">{log.verifiedBy}</p>
                              </div>
                              <span className="font-mono text-zinc-400 tabular-nums">
                                {formatDateTime(log.checkInTime)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Renewal & WhatsApp Alerts */}
                  <div className="rounded-xl border border-zinc-800 bg-[#111114] p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-yellow-400" />
                        <h2 className="font-display text-xl font-bold text-white">
                          Automated Renewal &amp; WhatsApp Alerts
                        </h2>
                      </div>
                      <span className="font-mono text-xs text-zinc-400">
                        Cycle ends {formatShortDate(profile.subscriptionEndDate)}
                      </span>
                    </div>
                    <div className="mt-4 divide-y divide-zinc-800/80">
                      {!data.notifications || data.notifications.length === 0 ? (
                        <p className="py-2 text-xs text-zinc-400">
                          No renewal alerts triggered yet. Reminders are dispatched automatically
                          before your subscription end date.
                        </p>
                      ) : (
                        data.notifications.slice(0, 4).map((ntf) => (
                          <div key={ntf.id} className="py-3 text-xs space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-zinc-200">
                                {ntf.channel} · {ntf.provider}
                              </span>
                              <span className="font-mono text-zinc-500 tabular-nums">
                                {formatDateTime(ntf.dispatchedAt)}
                              </span>
                            </div>
                            <p className="text-zinc-400 leading-relaxed">{ntf.messagePreview}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* PERFORMANCE & GOALS TAB */}
              {activeTab === 'performance' && (
                <div className="space-y-8">
                  {/* Trend Chart + Add Performance Log */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    <div className="rounded-xl border border-zinc-800 bg-[#111114] p-6 lg:col-span-7">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="font-display text-xl font-bold text-white">
                            Performance Progression
                          </h2>
                          <p className="text-xs text-zinc-400">
                            Select an exercise or biometric metric to inspect trajectory
                          </p>
                        </div>
                        {metricNames.length > 0 && (
                          <select
                            aria-label="Select performance metric"
                            value={selectedMetricChart || metricNames[0]}
                            onChange={(e) => setSelectedMetricChart(e.target.value)}
                            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-white focus:border-red-500 focus:outline-none"
                          >
                            {metricNames.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="mt-6">
                        {chartSeries.length === 0 ? (
                          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-zinc-800 text-sm text-zinc-500">
                            Log your first workout or body metric to chart progression.
                          </div>
                        ) : (
                          <PerformanceLineChart series={chartSeries} />
                        )}
                      </div>
                    </div>

                    <form
                      onSubmit={handleAddPerformance}
                      className="rounded-xl border border-zinc-800 bg-[#111114] p-6 space-y-4 lg:col-span-5"
                    >
                      <h2 className="font-display text-xl font-bold text-white">
                        Log Lift or Metric
                      </h2>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-zinc-400">Date</label>
                          <input
                            type="date"
                            value={perfDate}
                            onChange={(e) => setPerfDate(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-400">Category</label>
                          <select
                            value={perfCategory}
                            onChange={(e) =>
                              setPerfCategory(
                                e.target.value as
                                  | 'Strength Lift'
                                  | 'Conditioning'
                                  | 'Body Composition'
                              )
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                          >
                            <option value="Strength Lift">Strength Lift</option>
                            <option value="Conditioning">Conditioning</option>
                            <option value="Body Composition">Body Composition</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-zinc-400">Exercise / Metric</label>
                        <input
                          type="text"
                          required
                          value={perfMetric}
                          onChange={(e) => setPerfMetric(e.target.value)}
                          placeholder="Back Squat 1RM"
                          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-zinc-400">Value</label>
                          <input
                            type="number"
                            step="0.5"
                            required
                            value={perfValue}
                            onChange={(e) => setPerfValue(e.target.value)}
                            placeholder="140"
                            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white font-mono focus:border-red-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-400">Unit</label>
                          <input
                            type="text"
                            required
                            value={perfUnit}
                            onChange={(e) => setPerfUnit(e.target.value)}
                            placeholder="kg"
                            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-zinc-400">Notes (optional)</label>
                        <input
                          type="text"
                          value={perfNotes}
                          onChange={(e) => setPerfNotes(e.target.value)}
                          placeholder="RPE 8.5, clean depth"
                          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-xs font-semibold text-white hover:bg-red-500"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Save Performance Entry</span>
                      </button>
                    </form>
                  </div>

                  {/* Performance Log Table */}
                  <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
                    <div className="border-b border-zinc-800 px-6 py-4">
                      <h3 className="font-display text-lg font-bold text-white">
                        Logged Training Benchmarks
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[600px] text-left text-sm">
                        <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                          <tr>
                            <th className="px-5 py-3">Date</th>
                            <th className="px-5 py-3">Metric</th>
                            <th className="px-5 py-3">Category</th>
                            <th className="px-5 py-3 text-right">Result</th>
                            <th className="px-5 py-3">Notes</th>
                            <th className="px-5 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/70">
                          {data.performanceLogs.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-5 py-8 text-center text-xs text-zinc-500">
                                No benchmarks logged yet.
                              </td>
                            </tr>
                          ) : (
                            [...data.performanceLogs]
                              .sort((a, b) => b.date.localeCompare(a.date))
                              .map((entry) => (
                                <tr key={entry.id} className="hover:bg-zinc-900/40">
                                  <td className="px-5 py-3 font-mono text-xs text-zinc-400 tabular-nums">
                                    {formatShortDate(entry.date)}
                                  </td>
                                  <td className="px-5 py-3 font-medium text-white">
                                    {entry.metric}
                                  </td>
                                  <td className="px-5 py-3 text-xs text-zinc-400">
                                    {entry.category}
                                  </td>
                                  <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-yellow-400 tabular-nums">
                                    {entry.value} {entry.unit}
                                  </td>
                                  <td className="px-5 py-3 text-xs text-zinc-400">
                                    {entry.notes || '—'}
                                  </td>
                                  <td className="px-5 py-3 text-right">
                                    <button
                                      type="button"
                                      onClick={() => handleDeletePerformance(entry.id)}
                                      aria-label={`Delete ${entry.metric}`}
                                      className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Goals Management */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    <div className="space-y-4 lg:col-span-7">
                      <h2 className="font-display text-2xl font-bold text-white">
                        Personal Training Goals
                      </h2>
                      {data.goals.length === 0 ? (
                        <div className="rounded-xl border border-zinc-800 bg-[#111114] p-6 text-sm text-zinc-400">
                          Create your first target on the right to track lift or attendance
                          milestones.
                        </div>
                      ) : (
                        data.goals.map((goal) => {
                          const span = Math.abs(goal.targetValue - goal.startValue) || 1;
                          const done = Math.abs(goal.currentValue - goal.startValue);
                          const pct =
                            goal.status === 'Achieved'
                              ? 100
                              : Math.min(100, Math.max(0, Math.round((done / span) * 100)));

                          return (
                            <div
                              key={goal.id}
                              className="rounded-xl border border-zinc-800 bg-[#111114] p-5 space-y-3"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <h3 className="font-semibold text-white">{goal.title}</h3>
                                  <p className="text-xs text-zinc-400">
                                    {goal.metric} · Target by {formatShortDate(goal.deadline)}
                                  </p>
                                </div>
                                <span
                                  className={`text-xs font-semibold ${
                                    goal.status === 'Achieved'
                                      ? 'text-emerald-400'
                                      : 'text-amber-400'
                                  }`}
                                >
                                  {goal.status}
                                </span>
                              </div>

                              <div className="space-y-1">
                                <div className="flex justify-between font-mono text-xs text-zinc-300 tabular-nums">
                                  <span>
                                    Current: {goal.currentValue} {goal.unit}
                                  </span>
                                  <span>
                                    Target: {goal.targetValue} {goal.unit} ({pct}%)
                                  </span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                                  <div
                                    className={`h-full rounded-full ${
                                      goal.status === 'Achieved' ? 'bg-emerald-500' : 'bg-red-600'
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <input
                                  type="number"
                                  step="0.5"
                                  placeholder={`Update (${goal.unit})`}
                                  value={goalProgressEdits[goal.id] ?? ''}
                                  onChange={(e) =>
                                    setGoalProgressEdits((prev) => ({
                                      ...prev,
                                      [goal.id]: e.target.value,
                                    }))
                                  }
                                  className="w-36 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateGoal(goal.id)}
                                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-500"
                                >
                                  Save Progress
                                </button>
                                {goal.status !== 'Achieved' && (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateGoal(goal.id, 'Achieved')}
                                    className="rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30"
                                  >
                                    Mark Achieved
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteGoal(goal.id)}
                                  aria-label={`Delete goal ${goal.title}`}
                                  className="ml-auto rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <form
                      onSubmit={handleCreateGoal}
                      className="rounded-xl border border-zinc-800 bg-[#111114] p-6 space-y-4 self-start lg:col-span-5"
                    >
                      <h3 className="font-display text-xl font-bold text-white">Set New Goal</h3>
                      <div>
                        <label className="block text-xs text-zinc-400">Goal Title</label>
                        <input
                          type="text"
                          required
                          value={goalTitle}
                          onChange={(e) => setGoalTitle(e.target.value)}
                          placeholder="180 kg Deadlift Milestone"
                          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400">Metric Name</label>
                        <input
                          type="text"
                          required
                          value={goalMetric}
                          onChange={(e) => setGoalMetric(e.target.value)}
                          placeholder="Deadlift 1RM"
                          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs text-zinc-400">Start</label>
                          <input
                            type="number"
                            step="0.5"
                            value={goalStart}
                            onChange={(e) => setGoalStart(e.target.value)}
                            placeholder="150"
                            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-400">Target</label>
                          <input
                            type="number"
                            step="0.5"
                            required
                            value={goalTarget}
                            onChange={(e) => setGoalTarget(e.target.value)}
                            placeholder="180"
                            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-400">Unit</label>
                          <input
                            type="text"
                            required
                            value={goalUnit}
                            onChange={(e) => setGoalUnit(e.target.value)}
                            placeholder="kg"
                            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400">Target Date</label>
                        <input
                          type="date"
                          required
                          value={goalDeadline}
                          onChange={(e) => setGoalDeadline(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-red-600 py-2.5 text-xs font-semibold text-white hover:bg-red-500"
                      >
                        Create Goal
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* ATTENDANCE LOGS TAB */}
              {activeTab === 'attendance' && (
                <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 px-6 py-4">
                    <div>
                      <h2 className="font-display text-xl font-bold text-white">
                        Check-In History
                      </h2>
                      <p className="text-xs text-zinc-400">
                        Total recorded floor visits: {data.attendanceLogs.length}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={checkInBusy}
                      onClick={handleCheckIn}
                      className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500"
                    >
                      {checkInBusy ? 'Recording...' : 'Record Check-In Now'}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                        <tr>
                          <th className="px-6 py-3">Date &amp; Time</th>
                          <th className="px-6 py-3">Training Zone / Session</th>
                          <th className="px-6 py-3">Verification Method</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/70">
                        {data.attendanceLogs.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-6 py-10 text-center text-sm text-zinc-400">
                              No attendance logs yet. Use &ldquo;Record Check-In Now&rdquo; to log
                              today&apos;s session.
                            </td>
                          </tr>
                        ) : (
                          data.attendanceLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-zinc-900/40">
                              <td className="px-6 py-3.5 font-mono text-xs text-zinc-200 tabular-nums">
                                {formatDateTime(log.checkInTime)}
                              </td>
                              <td className="px-6 py-3.5 font-medium text-white">
                                {log.zoneOrClass}
                              </td>
                              <td className="px-6 py-3.5 text-xs text-zinc-400">
                                {log.verifiedBy}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* FEE & PAYMENT UPLOAD TAB */}
              {activeTab === 'payments' && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    {/* Payment Submission Form */}
                    <form
                      onSubmit={handleSubmitPayment}
                      className="rounded-xl border border-zinc-800 bg-[#111114] p-6 space-y-5 lg:col-span-7"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h2 className="font-display text-2xl font-bold text-white">
                            Upload Monthly Fee Proof
                          </h2>
                          <p className="text-xs text-zinc-400">
                            Supported channels: JazzCash, EasyPaisa, Cash, or Bank Transfer
                          </p>
                        </div>
                        <FeeStatusText status={profile.feeStatus} />
                      </div>

                      {/* Channel Selector */}
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {(['JazzCash', 'EasyPaisa', 'Bank Transfer', 'Cash'] as PaymentMethod[]).map(
                          (method) => (
                            <button
                              key={method}
                              type="button"
                              onClick={() => setPayMethod(method)}
                              className={`rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                                payMethod === method
                                  ? 'border-red-500 bg-red-600/15 text-white'
                                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                              }`}
                            >
                              {method}
                            </button>
                          )
                        )}
                      </div>

                      {/* Channel Instructions Box */}
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs">
                        <p className="font-semibold text-white">
                          {PAYMENT_CHANNELS[payMethod].title}
                        </p>
                        <p className="mt-1 font-mono text-yellow-400">
                          {PAYMENT_CHANNELS[payMethod].accountLabel}:{' '}
                          {PAYMENT_CHANNELS[payMethod].accountValue}
                        </p>
                        <p className="mt-1.5 text-zinc-400">
                          {PAYMENT_CHANNELS[payMethod].instruction}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs text-zinc-300">Billing Month</label>
                          <input
                            type="month"
                            required
                            value={payMonth}
                            onChange={(e) => setPayMonth(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white font-mono focus:border-red-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-300">Amount (PKR)</label>
                          <input
                            type="number"
                            required
                            value={payAmount}
                            onChange={(e) => setPayAmount(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white font-mono focus:border-red-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-zinc-300">
                          Transaction Reference / TID / Cash Slip #
                        </label>
                        <input
                          type="text"
                          required
                          value={payRef}
                          onChange={(e) => setPayRef(e.target.value)}
                          placeholder={
                            payMethod === 'JazzCash'
                              ? 'e.g. JC-8849201142'
                              : payMethod === 'EasyPaisa'
                                ? 'e.g. EP-5520918477'
                                : payMethod === 'Bank Transfer'
                                  ? 'e.g. IBFT-99201483'
                                  : 'e.g. CASH-DESK-1140'
                          }
                          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white font-mono focus:border-red-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-zinc-300">
                          Upload Receipt Screenshot or PDF{' '}
                          {payMethod === 'Cash' ? '(Optional for Cash)' : '(Required)'}
                        </label>
                        <label className="mt-1.5 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-zinc-700 bg-zinc-950 px-4 py-3 text-xs text-zinc-300 hover:border-red-500">
                          <div className="flex items-center gap-2.5 truncate">
                            <FileUp className="h-4 w-4 shrink-0 text-red-500" />
                            <span className="truncate">
                              {payFile
                                ? `${payFile.name} (${Math.round(payFile.size / 1024)} KB)`
                                : 'Choose PNG, JPG, WEBP, or PDF receipt file'}
                            </span>
                          </div>
                          <span className="rounded bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-white shrink-0">
                            Browse
                          </span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf"
                            onChange={(e) => setPayFile(e.target.files?.[0] || null)}
                            className="sr-only"
                          />
                        </label>
                      </div>

                      <div>
                        <label className="block text-xs text-zinc-300">Notes (Optional)</label>
                        <input
                          type="text"
                          value={payNotes}
                          onChange={(e) => setPayNotes(e.target.value)}
                          placeholder="Sender account title or remarks"
                          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={payBusy}
                        className="w-full rounded-lg bg-red-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-60"
                      >
                        {payBusy ? 'Uploading Receipt...' : 'Submit Payment for Verification'}
                      </button>
                    </form>

                    {/* Account Summary Card */}
                    <div className="rounded-xl border border-zinc-800 bg-[#111114] p-6 space-y-5 self-start lg:col-span-5">
                      <h3 className="font-display text-xl font-bold text-white">
                        Membership Billing Summary
                      </h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between border-b border-zinc-800 pb-2.5">
                          <span className="text-zinc-400">Active Plan</span>
                          <span className="font-semibold text-white">{profile.membershipTier}</span>
                        </div>
                        {profile.discountPkr && profile.discountPkr > 0 ? (
                          <>
                            <div className="flex justify-between border-b border-zinc-800 pb-2.5">
                              <span className="text-zinc-400">Standard Plan Rate</span>
                              <span className="font-mono text-zinc-400 line-through tabular-nums">
                                {formatPkr(profile.baseMonthlyFeePkr || profile.monthlyFeePkr)}
                              </span>
                            </div>
                            <div className="flex justify-between border-b border-zinc-800 pb-2.5">
                              <span className="text-zinc-400">Applied Discount</span>
                              <span className="font-mono text-emerald-400 tabular-nums">
                                -{formatPkr(profile.discountPkr)}
                              </span>
                            </div>
                          </>
                        ) : null}
                        <div className="flex justify-between border-b border-zinc-800 pb-2.5">
                          <span className="text-zinc-400">Monthly Rate</span>
                          <span className="font-mono font-semibold text-white tabular-nums">
                            {formatPkr(profile.monthlyFeePkr)}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800 pb-2.5">
                          <span className="text-zinc-400">Subscription Ends</span>
                          <span className="font-mono text-zinc-200 tabular-nums">
                            {formatShortDate(profile.subscriptionEndDate)}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800 pb-2.5">
                          <span className="text-zinc-400">Paid Through</span>
                          <span className="font-mono text-zinc-200 tabular-nums">
                            {profile.feePaidThrough}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Current Verification</span>
                          <FeeStatusText status={profile.feeStatus} />
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed text-zinc-400">
                        Once you upload your receipt, FitBase management matches the Transaction ID
                        and extends your subscription cycle by 30 days.
                      </p>
                    </div>
                  </div>

                  {/* Payment Submission History */}
                  <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
                    <div className="border-b border-zinc-800 px-6 py-4">
                      <h3 className="font-display text-xl font-bold text-white">
                        Payment Verification Ledger
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[700px] text-left text-sm">
                        <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                          <tr>
                            <th className="px-5 py-3">Month</th>
                            <th className="px-5 py-3">Channel &amp; Ref</th>
                            <th className="px-5 py-3 text-right">Amount</th>
                            <th className="px-5 py-3">Status</th>
                            <th className="px-5 py-3">Admin Remark</th>
                            <th className="px-5 py-3 text-right">Receipt</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/70">
                          {data.payments.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-5 py-8 text-center text-xs text-zinc-500">
                                No payment submissions yet.
                              </td>
                            </tr>
                          ) : (
                            data.payments.map((p) => (
                              <tr key={p.id} className="hover:bg-zinc-900/40">
                                <td className="px-5 py-3.5 font-mono text-xs text-white tabular-nums">
                                  {p.billingMonth}
                                </td>
                                <td className="px-5 py-3.5">
                                  <p className="text-xs font-semibold text-zinc-200">{p.method}</p>
                                  <p className="font-mono text-xs text-zinc-500">
                                    {p.transactionRef}
                                  </p>
                                </td>
                                <td className="px-5 py-3.5 text-right font-mono text-xs font-semibold text-white tabular-nums">
                                  {formatPkr(p.amountPkr)}
                                </td>
                                <td className="px-5 py-3.5">
                                  <PaymentStatusText status={p.status} />
                                </td>
                                <td className="px-5 py-3.5 text-xs text-zinc-400 max-w-xs truncate">
                                  {p.adminRemark || 'Awaiting review'}
                                </td>
                                <td className="px-5 py-3.5 text-right">
                                  {p.receiptUrl ? (
                                    <button
                                      type="button"
                                      onClick={() => setPreviewReceipt(p)}
                                      className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:border-zinc-500"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      <span>View</span>
                                    </button>
                                  ) : (
                                    <span className="text-xs text-zinc-500">Cash Desk</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* CLASS BOOKINGS TAB */}
              {activeTab === 'classes' && (
                <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
                  <div className="border-b border-zinc-800 px-6 py-4">
                    <h2 className="font-display text-xl font-bold text-white">
                      Weekly Class Reservations
                    </h2>
                    <p className="text-xs text-zinc-400">
                      Reserve or release your spot in coach-led FitBase classes
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                        <tr>
                          <th className="px-5 py-3">Schedule</th>
                          <th className="px-5 py-3">Class</th>
                          <th className="px-5 py-3">Coach &amp; Zone</th>
                          <th className="px-5 py-3 text-right">Capacity</th>
                          <th className="px-5 py-3 text-right">Booking</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/70">
                        {data.classes.map((cls) => {
                          const isBooked = cls.bookedMemberIds.includes(profile.id);
                          const left = Math.max(0, cls.capacity - cls.bookedMemberIds.length);
                          return (
                            <tr key={cls.id} className="hover:bg-zinc-900/40">
                              <td className="px-5 py-3.5 font-mono text-xs text-zinc-300 tabular-nums">
                                {cls.dayOfWeek} · {cls.startTime}
                              </td>
                              <td className="px-5 py-3.5">
                                <p className="font-medium text-white">{cls.title}</p>
                                <p className="text-xs text-zinc-500">{cls.discipline}</p>
                              </td>
                              <td className="px-5 py-3.5 text-xs text-zinc-300">
                                {cls.trainerName} · {cls.zone}
                              </td>
                              <td className="px-5 py-3.5 text-right font-mono text-xs text-zinc-400 tabular-nums">
                                {left} / {cls.capacity} open
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleToggleClass(cls.id)}
                                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                                    isBooked
                                      ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                      : 'bg-zinc-100 text-zinc-950 hover:bg-white'
                                  }`}
                                >
                                  {isBooked ? 'Booked · Cancel' : 'Reserve Spot'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* FEEDBACK TAB */}
              {activeTab === 'feedback' && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <form
                    onSubmit={handleSubmitFeedback}
                    className="rounded-xl border border-zinc-800 bg-[#111114] p-6 space-y-4 self-start lg:col-span-5"
                  >
                    <h2 className="font-display text-xl font-bold text-white">
                      Submit Gym or Trainer Feedback
                    </h2>
                    <div>
                      <label className="block text-xs text-zinc-400">Category</label>
                      <select
                        value={fbCategory}
                        onChange={(e) =>
                          setFbCategory(
                            e.target.value as 'Equipment' | 'Trainer' | 'Facility' | 'Billing'
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                      >
                        <option value="Facility">Facility &amp; Hygiene</option>
                        <option value="Equipment">Equipment &amp; Platforms</option>
                        <option value="Trainer">Trainer / Coaching</option>
                        <option value="Billing">Billing &amp; Membership</option>
                      </select>
                    </div>

                    {fbCategory === 'Trainer' && (
                      <div>
                        <label className="block text-xs text-zinc-400">Select Coach</label>
                        <select
                          value={fbTrainerId}
                          onChange={(e) => setFbTrainerId(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                        >
                          <option value="">General Coaching Staff</option>
                          {data.trainers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs text-zinc-400">Rating (1 to 5)</label>
                      <div className="mt-1 flex gap-2">
                        {[1, 2, 3, 4, 5].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setFbRating(num)}
                            className={`h-9 w-9 rounded-lg border font-mono text-xs font-semibold ${
                              fbRating === num
                                ? 'border-yellow-400 bg-yellow-400/15 text-yellow-300'
                                : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                            }`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-zinc-400">Message</label>
                      <textarea
                        rows={4}
                        required
                        value={fbMessage}
                        onChange={(e) => setFbMessage(e.target.value)}
                        placeholder="Share equipment requests, coaching notes, or facility feedback..."
                        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={fbBusy}
                      className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-500"
                    >
                      {fbBusy ? 'Submitting...' : 'Submit Feedback'}
                    </button>
                  </form>

                  <div className="space-y-4 lg:col-span-7">
                    <h2 className="font-display text-xl font-bold text-white">
                      Your Submitted Feedback
                    </h2>
                    {data.feedback.length === 0 ? (
                      <div className="rounded-xl border border-zinc-800 bg-[#111114] p-6 text-sm text-zinc-400">
                        You have not submitted any feedback yet.
                      </div>
                    ) : (
                      data.feedback.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-zinc-800 bg-[#111114] p-5 space-y-3"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-zinc-300">
                              {item.category} · Rating {item.rating}/5
                            </span>
                            <span
                              className={`font-semibold ${
                                item.status === 'Resolved'
                                  ? 'text-emerald-400'
                                  : item.status === 'In Review'
                                    ? 'text-amber-400'
                                    : 'text-zinc-300'
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-100">{item.message}</p>
                          {item.adminReply && (
                            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
                              <span className="font-semibold text-yellow-400">
                                Management Response:{' '}
                              </span>
                              {item.adminReply}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </main>

      {/* Receipt Preview Modal */}
      {previewReceipt && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#111114] p-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="font-display text-xl font-bold text-white">
                  {previewReceipt.method} Receipt
                </h3>
                <p className="font-mono text-xs text-zinc-400">{previewReceipt.transactionRef}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
              {previewReceipt.receiptUrl?.endsWith('.pdf') ? (
                <div className="p-8 text-center">
                  <a
                    href={previewReceipt.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-red-400 underline"
                  >
                    Open Uploaded PDF Receipt
                  </a>
                </div>
              ) : (
                <img
                  src={previewReceipt.receiptUrl || ''}
                  alt={`Payment receipt ${previewReceipt.transactionRef}`}
                  className="max-h-[420px] w-full object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PerformanceLineChart({
  series,
}: {
  series: Array<{ id: string; date: string; value: number; unit: string }>;
}) {
  if (series.length === 1) {
    const pt = series[0];
    return (
      <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 p-6">
        <p className="font-mono text-3xl font-bold text-yellow-400 tabular-nums">
          {pt.value} {pt.unit}
        </p>
        <p className="mt-1 text-xs text-zinc-400">Logged on {formatShortDate(pt.date)}</p>
      </div>
    );
  }

  const width = 560;
  const height = 200;
  const padX = 36;
  const padY = 24;
  const values = series.map((s) => s.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = series.map((item, idx) => {
    const x = padX + (idx / (series.length - 1)) * (width - padX * 2);
    const y = height - padY - ((item.value - min) / span) * (height - padY * 2);
    return { ...item, x, y };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full overflow-visible">
        <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="#27272A" strokeDasharray="3 3" />
        <line
          x1={padX}
          y1={height - padY}
          x2={width - padX}
          y2={height - padY}
          stroke="#27272A"
        />
        <polyline
          fill="none"
          stroke="#DC2626"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polylinePoints}
        />
        {points.map((p) => (
          <g key={p.id}>
            <circle cx={p.x} cy={p.y} r="5" fill="#FACC15" stroke="#09090B" strokeWidth="2" />
            <text
              x={p.x}
              y={p.y - 12}
              textAnchor="middle"
              fill="#F4F4F5"
              fontSize="11"
              fontFamily="JetBrains Mono, monospace"
            >
              {p.value}
            </text>
            <text
              x={p.x}
              y={height - 4}
              textAnchor="middle"
              fill="#71717A"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
            >
              {p.date.slice(5)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

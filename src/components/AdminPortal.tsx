import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Award,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Eye,
  Fingerprint,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  Users,
  X,
  XCircle,
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
import { ReceptionWorkspace, type ReceptionSubView } from './ReceptionWorkspace';
import type {
  AdminOverviewPayload,
  FeedbackEntry,
  PaymentSubmission,
  TrainerPortraitKey,
  TrainerRecord,
  UserProfile,
} from '../types';

interface AdminPortalProps {
  currentUser: UserProfile;
  onTrainersChanged?: () => void;
  onBackToSite: () => void;
  onSignOut: () => void;
}

type AdminTab = 'overview' | 'reception' | 'payments' | 'members' | 'trainers' | 'feedback';

export function AdminPortal({
  currentUser,
  onTrainersChanged,
  onBackToSite,
  onSignOut,
}: AdminPortalProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [receptionSubView, setReceptionSubView] = useState<ReceptionSubView>('checkin');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Payment filters & inspection modal
  const [paymentFilter, setPaymentFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>(
    'All'
  );
  const [paymentSearch, setPaymentSearch] = useState('');
  const [inspectingPayment, setInspectingPayment] = useState<PaymentSubmission | null>(null);
  const [adminRemark, setAdminRemark] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

  // Member directory filters
  const [memberSearch, setMemberSearch] = useState('');
  const [memberFeeFilter, setMemberFeeFilter] = useState<
    'All' | 'Paid' | 'Pending Verification' | 'Overdue'
  >('All');

  // Trainer CRUD & evaluation state
  const [trainerModalOpen, setTrainerModalOpen] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<TrainerRecord | null>(null);
  const [deletingTrainer, setDeletingTrainer] = useState<TrainerRecord | null>(null);
  const [trName, setTrName] = useState('');
  const [trSpecialty, setTrSpecialty] = useState('');
  const [trCerts, setTrCerts] = useState('');
  const [trExpYears, setTrExpYears] = useState('3');
  const [trActiveClients, setTrActiveClients] = useState('0');
  const [trPortraitKey, setTrPortraitKey] = useState<TrainerPortraitKey>('default');
  const [trPortraitUrl, setTrPortraitUrl] = useState('');
  const [trBio, setTrBio] = useState('');
  const [trSessions, setTrSessions] = useState('0');
  const [trAttendance, setTrAttendance] = useState('100');
  const [trRetention, setTrRetention] = useState('100');
  const [trRating, setTrRating] = useState('5.0');
  const [trNote, setTrNote] = useState('');
  const [trBusy, setTrBusy] = useState(false);

  // Feedback management
  const [fbFilter, setFbFilter] = useState<'All' | 'Open' | 'In Review' | 'Resolved'>('All');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [statusDrafts, setStatusDrafts] = useState<Record<string, FeedbackEntry['status']>>({});

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  };

  const fetchAdminData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await api.getAdminOverview();
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin console.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  const filteredPayments = useMemo(() => {
    if (!data) return [];
    const q = paymentSearch.trim().toLowerCase();
    return data.payments.filter((p) => {
      const statusOk = paymentFilter === 'All' || p.status === paymentFilter;
      const queryOk =
        !q ||
        p.memberName.toLowerCase().includes(q) ||
        p.memberCode.toLowerCase().includes(q) ||
        p.transactionRef.toLowerCase().includes(q) ||
        p.method.toLowerCase().includes(q);
      return statusOk && queryOk;
    });
  }, [data, paymentFilter, paymentSearch]);

  const filteredMembers = useMemo(() => {
    if (!data) return [];
    const q = memberSearch.trim().toLowerCase();
    return data.members.filter((m) => {
      const statusOk = memberFeeFilter === 'All' || m.feeStatus === memberFeeFilter;
      const queryOk =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.memberCode.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q);
      return statusOk && queryOk;
    });
  }, [data, memberSearch, memberFeeFilter]);

  const filteredFeedback = useMemo(() => {
    if (!data) return [];
    return data.feedback.filter((f) => fbFilter === 'All' || f.status === fbFilter);
  }, [data, fbFilter]);

  const handleOpenInspect = (payment: PaymentSubmission) => {
    setInspectingPayment(payment);
    setAdminRemark(payment.adminRemark || '');
  };

  const handleReviewPayment = async (action: 'approve' | 'reject') => {
    if (!inspectingPayment) return;
    setReviewBusy(true);
    try {
      await api.reviewPayment(inspectingPayment.id, action, adminRemark);
      setInspectingPayment(null);
      await fetchAdminData();
      showToast(
        action === 'approve'
          ? 'Payment approved and member fee marked Paid.'
          : 'Payment submission rejected.'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Review failed.');
    } finally {
      setReviewBusy(false);
    }
  };

  const handleRecordCash = async (member: UserProfile) => {
    try {
      await api.updateMemberFeeStatus(member.id, { recordCashPayment: true });
      await fetchAdminData();
      showToast(`Cash fee recorded for ${member.name}. Status set to Paid.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to record cash payment.');
    }
  };

  const handleSetFeeOverdue = async (member: UserProfile) => {
    try {
      await api.updateMemberFeeStatus(member.id, { feeStatus: 'Overdue' });
      await fetchAdminData();
      showToast(`${member.name} fee status updated to Overdue.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const handleFrontDeskCheckIn = async (member: UserProfile) => {
    try {
      await api.adminCheckInMember(member.id);
      await fetchAdminData();
      showToast(`Front desk check-in logged for ${member.name}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Check-in failed.');
    }
  };

  const openAddTrainerModal = () => {
    setEditingTrainer(null);
    setTrName('');
    setTrSpecialty('');
    setTrCerts('');
    setTrExpYears('2');
    setTrActiveClients('0');
    setTrPortraitKey('default');
    setTrPortraitUrl('');
    setTrBio('');
    setTrSessions('0');
    setTrAttendance('100');
    setTrRetention('100');
    setTrRating('5.0');
    setTrNote('');
    setTrainerModalOpen(true);
  };

  const openTrainerEditor = (trainer: TrainerRecord) => {
    setEditingTrainer(trainer);
    setTrName(trainer.name);
    setTrSpecialty(trainer.specialty);
    setTrCerts(trainer.certifications);
    setTrExpYears(String(trainer.experienceYears));
    setTrActiveClients(String(trainer.activeClients));
    setTrPortraitKey(trainer.portraitKey || 'default');
    setTrPortraitUrl(trainer.portraitUrl || '');
    setTrBio(trainer.bio);
    setTrSessions(String(trainer.sessionsThisMonth));
    setTrAttendance(String(trainer.attendanceCompletionRate));
    setTrRetention(String(trainer.clientRetentionRate));
    setTrRating(String(trainer.rating));
    setTrNote(trainer.adminReviewNote);
    setTrainerModalOpen(true);
  };

  const handleSaveTrainer = async (e: FormEvent) => {
    e.preventDefault();
    if (!trName.trim() || !trSpecialty.trim()) {
      showToast('Trainer name and specialty are required.');
      return;
    }
    setTrBusy(true);
    try {
      const payload = {
        name: trName.trim(),
        specialty: trSpecialty.trim(),
        certifications: trCerts.trim(),
        experienceYears: Number(trExpYears) || 0,
        activeClients: Number(trActiveClients) || 0,
        portraitKey: trPortraitKey,
        portraitUrl: trPortraitUrl.trim() || null,
        bio: trBio.trim(),
        sessionsThisMonth: Number(trSessions) || 0,
        attendanceCompletionRate: Number(trAttendance) || 0,
        clientRetentionRate: Number(trRetention) || 0,
        rating: Number(trRating) || 5,
        adminReviewNote: trNote.trim(),
      };

      if (editingTrainer) {
        await api.updateTrainer(editingTrainer.id, payload);
        showToast(`Trainer profile updated for ${trName.trim()}.`);
      } else {
        await api.createTrainer(payload);
        showToast(`New trainer added: ${trName.trim()}.`);
      }

      setTrainerModalOpen(false);
      setEditingTrainer(null);
      await fetchAdminData();
      onTrainersChanged?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save trainer.');
    } finally {
      setTrBusy(false);
    }
  };

  const handleConfirmDeleteTrainer = async () => {
    if (!deletingTrainer) return;
    setTrBusy(true);
    try {
      const removedName = deletingTrainer.name;
      await api.deleteTrainer(deletingTrainer.id);
      setDeletingTrainer(null);
      await fetchAdminData();
      onTrainersChanged?.();
      showToast(`Deleted trainer record for ${removedName}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete trainer.');
    } finally {
      setTrBusy(false);
    }
  };

  const handleSaveFeedback = async (item: FeedbackEntry) => {
    const status = statusDrafts[item.id] || item.status;
    const adminReply = replyDrafts[item.id] ?? item.adminReply ?? '';
    try {
      await api.updateFeedbackStatus(item.id, { status, adminReply });
      await fetchAdminData();
      showToast('Feedback record updated.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const navItems: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: 'Operations Overview', icon: LayoutDashboard },
    { id: 'reception', label: 'Reception & Biometrics', icon: Fingerprint },
    { id: 'payments', label: 'Fee Verification', icon: CreditCard },
    { id: 'members', label: 'Member Directory', icon: Users },
    { id: 'trainers', label: 'Trainer Management', icon: Award },
    { id: 'feedback', label: 'Feedback Inbox', icon: MessageSquare },
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
          aria-label="Toggle admin navigation"
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
                <p className="mt-1 text-xs text-yellow-400">Admin Console</p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-zinc-800 bg-[#121216] p-3.5">
              <p className="text-sm font-semibold text-white truncate">{currentUser.name}</p>
              <p className="mt-0.5 text-xs text-zinc-400">Gym Owner &amp; Operations</p>
              <p className="mt-1 font-mono text-[11px] text-zinc-500">{currentUser.email}</p>
            </div>

            <nav aria-label="Admin sections" className="mt-6 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                const badgeCount =
                  item.id === 'payments'
                    ? data?.metrics.pendingVerifications || 0
                    : item.id === 'feedback'
                      ? data?.metrics.openFeedbackCount || 0
                      : 0;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-red-600 text-white'
                        : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3 truncate">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {badgeCount > 0 && (
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          active ? 'text-white' : 'text-yellow-400'
                        }`}
                      >
                        {badgeCount}
                      </span>
                    )}
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
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-5">
            <div>
              <p className="text-xs text-zinc-400">
                FitBase Management <span aria-hidden="true">/</span>{' '}
                <span className="text-zinc-200">
                  {navItems.find((i) => i.id === activeTab)?.label}
                </span>
              </p>
              <h1 className="mt-1 font-display text-3xl font-bold text-white">
                {navItems.find((i) => i.id === activeTab)?.label}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setReceptionSubView('notifications');
                  setActiveTab('reception');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-[#111114] px-3.5 py-2 text-xs font-medium text-yellow-400 hover:border-yellow-500/50"
              >
                <Bell className="h-3.5 w-3.5" />
                <span>Renewals &amp; WhatsApp ({data?.metrics.expiringSoonCount ?? 0})</span>
              </button>
              <button
                type="button"
                onClick={fetchAdminData}
                className="rounded-lg border border-zinc-800 bg-[#111114] px-3.5 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-600 hover:text-white"
              >
                Refresh Data
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
              {/* RECEPTION & BIOMETRICS TAB */}
              {activeTab === 'reception' && (
                <ReceptionWorkspace
                  activeView={receptionSubView}
                  onChangeView={setReceptionSubView}
                  onDataChanged={fetchAdminData}
                />
              )}

              {/* OVERVIEW TAB */}
              {activeTab === 'overview' && (
                <>
                  <div className="grid grid-cols-1 divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-[#111114] sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
                    <div className="p-5">
                      <p className="text-xs text-zinc-400">Collected This Month</p>
                      <p className="mt-1.5 font-mono text-2xl font-bold text-white tabular-nums">
                        {formatPkr(data.metrics.collectedThisMonthPkr)}
                      </p>
                      <p className="mt-1 text-xs text-emerald-400 tabular-nums">
                        {data.metrics.paidMembers} of {data.metrics.totalMembers} members Paid
                      </p>
                    </div>
                    <div className="p-5">
                      <p className="text-xs text-zinc-400">Pending Receipt Reviews</p>
                      <p className="mt-1.5 font-mono text-2xl font-bold text-amber-400 tabular-nums">
                        {data.metrics.pendingVerifications}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {data.metrics.overdueMembers} overdue accounts
                      </p>
                    </div>
                    <div className="p-5">
                      <p className="text-xs text-zinc-400">Avg Trainer Rating</p>
                      <p className="mt-1.5 font-mono text-2xl font-bold text-yellow-400 tabular-nums">
                        {data.metrics.avgTrainerRating.toFixed(1)} / 5.0
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Across {data.trainers.length} coaches
                      </p>
                    </div>
                    <div className="p-5">
                      <p className="text-xs text-zinc-400">Open Feedback &amp; Inquiries</p>
                      <p className="mt-1.5 font-mono text-2xl font-bold text-white tabular-nums">
                        {data.metrics.openFeedbackCount}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {data.metrics.todayCheckIns} check-ins today
                      </p>
                    </div>
                  </div>

                  {/* Pending Verifications Queue + Recent Floor Check-ins */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    <div className="rounded-xl border border-zinc-800 bg-[#111114] p-6 lg:col-span-7">
                      <div className="flex items-center justify-between">
                        <h2 className="font-display text-xl font-bold text-white">
                          Pending Payment Verifications
                        </h2>
                        <button
                          type="button"
                          onClick={() => setActiveTab('payments')}
                          className="text-xs font-medium text-red-400 hover:text-red-300"
                        >
                          View All Receipts
                        </button>
                      </div>
                      <div className="mt-4 divide-y divide-zinc-800/80">
                        {data.payments.filter((p) => p.status === 'Pending').length === 0 ? (
                          <p className="py-6 text-sm text-zinc-400">
                            All uploaded receipts have been reviewed.
                          </p>
                        ) : (
                          data.payments
                            .filter((p) => p.status === 'Pending')
                            .map((p) => (
                              <div
                                key={p.id}
                                className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                              >
                                <div>
                                  <p className="text-sm font-semibold text-white">
                                    {p.memberName}{' '}
                                    <span className="font-mono text-xs font-normal text-zinc-400">
                                      ({p.memberCode})
                                    </span>
                                  </p>
                                  <p className="font-mono text-xs text-zinc-400">
                                    {p.method} · {p.transactionRef} · {formatPkr(p.amountPkr)}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleOpenInspect(p)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  <span>Inspect Receipt</span>
                                </button>
                              </div>
                            ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-800 bg-[#111114] p-6 lg:col-span-5">
                      <h2 className="font-display text-xl font-bold text-white">
                        Recent Floor Check-Ins
                      </h2>
                      <div className="mt-4 divide-y divide-zinc-800/80">
                        {data.attendance.slice(0, 5).map((log) => (
                          <div key={log.id} className="flex items-center justify-between py-3 text-xs">
                            <div>
                              <p className="font-medium text-white">
                                {log.memberName}{' '}
                                <span className="font-mono text-zinc-500">{log.memberCode}</span>
                              </p>
                              <p className="text-zinc-400">{log.zoneOrClass}</p>
                            </div>
                            <span className="font-mono text-zinc-500 tabular-nums">
                              {formatDateTime(log.checkInTime)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* FEE VERIFICATION TAB */}
              {activeTab === 'payments' && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-800 bg-[#111114] p-1">
                      {(['All', 'Pending', 'Approved', 'Rejected'] as const).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setPaymentFilter(status)}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                            paymentFilter === status
                              ? 'bg-red-600 text-white'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>

                    <div className="relative w-full sm:w-72">
                      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                      <input
                        type="search"
                        value={paymentSearch}
                        onChange={(e) => setPaymentSearch(e.target.value)}
                        placeholder="Search member, TID, JazzCash..."
                        className="w-full rounded-lg border border-zinc-800 bg-[#111114] py-2 pl-9 pr-3 text-xs text-white placeholder:text-zinc-500 focus:border-red-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[780px] text-left text-sm">
                        <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                          <tr>
                            <th className="px-5 py-3">Member</th>
                            <th className="px-5 py-3">Month</th>
                            <th className="px-5 py-3">Channel &amp; Reference</th>
                            <th className="px-5 py-3 text-right">Amount</th>
                            <th className="px-5 py-3">Submitted</th>
                            <th className="px-5 py-3">Status</th>
                            <th className="px-5 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/70">
                          {filteredPayments.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-5 py-8 text-center text-xs text-zinc-500">
                                No payment records match the current filter.
                              </td>
                            </tr>
                          ) : (
                            filteredPayments.map((p) => (
                              <tr key={p.id} className="hover:bg-zinc-900/40">
                                <td className="px-5 py-3.5">
                                  <p className="font-medium text-white">{p.memberName}</p>
                                  <p className="font-mono text-xs text-zinc-500">
                                    {p.memberCode} · {p.membershipTier}
                                  </p>
                                </td>
                                <td className="px-5 py-3.5 font-mono text-xs text-zinc-300 tabular-nums">
                                  {p.billingMonth}
                                </td>
                                <td className="px-5 py-3.5">
                                  <p className="text-xs font-semibold text-zinc-200">{p.method}</p>
                                  <p className="font-mono text-xs text-zinc-400">
                                    {p.transactionRef}
                                  </p>
                                </td>
                                <td className="px-5 py-3.5 text-right font-mono text-xs font-semibold text-white tabular-nums">
                                  {formatPkr(p.amountPkr)}
                                </td>
                                <td className="px-5 py-3.5 font-mono text-xs text-zinc-400 tabular-nums">
                                  {formatDateTime(p.submittedAt)}
                                </td>
                                <td className="px-5 py-3.5">
                                  <PaymentStatusText status={p.status} />
                                </td>
                                <td className="px-5 py-3.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenInspect(p)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:border-red-500"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    <span>{p.status === 'Pending' ? 'Review' : 'Details'}</span>
                                  </button>
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

              {/* MEMBER DIRECTORY TAB */}
              {activeTab === 'members' && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-800 bg-[#111114] p-1">
                      {(['All', 'Paid', 'Pending Verification', 'Overdue'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setMemberFeeFilter(st)}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                            memberFeeFilter === st
                              ? 'bg-red-600 text-white'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    <div className="relative w-full sm:w-72">
                      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                      <input
                        type="search"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Search member name or code..."
                        className="w-full rounded-lg border border-zinc-800 bg-[#111114] py-2 pl-9 pr-3 text-xs text-white placeholder:text-zinc-500 focus:border-red-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                          <tr>
                            <th className="px-5 py-3">Member</th>
                            <th className="px-5 py-3">Plan &amp; Fee</th>
                            <th className="px-5 py-3">Paid Through</th>
                            <th className="px-5 py-3">Fee Status</th>
                            <th className="px-5 py-3 text-right">Management Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/70">
                          {filteredMembers.map((m) => (
                            <tr key={m.id} className="hover:bg-zinc-900/40">
                              <td className="px-5 py-3.5">
                                <p className="font-medium text-white">
                                  {m.name}{' '}
                                  <span className="font-mono text-xs text-zinc-500">
                                    ({m.memberCode})
                                  </span>
                                </p>
                                <p className="text-xs text-zinc-400">
                                  {m.email} · {m.phone}
                                </p>
                              </td>
                              <td className="px-5 py-3.5">
                                <p className="text-xs font-medium text-zinc-200">
                                  {m.membershipTier}
                                </p>
                                <p className="font-mono text-xs text-zinc-400 tabular-nums">
                                  {formatPkr(m.monthlyFeePkr)}/mo
                                </p>
                              </td>
                              <td className="px-5 py-3.5 font-mono text-xs text-zinc-300 tabular-nums">
                                {m.feePaidThrough}
                              </td>
                              <td className="px-5 py-3.5">
                                <FeeStatusText status={m.feeStatus} />
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleFrontDeskCheckIn(m)}
                                    className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:border-zinc-500"
                                  >
                                    <ClipboardCheck className="h-3.5 w-3.5" />
                                    <span>Check-In</span>
                                  </button>
                                  {m.feeStatus !== 'Paid' ? (
                                    <button
                                      type="button"
                                      onClick={() => handleRecordCash(m)}
                                      className="rounded bg-emerald-600/20 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30"
                                    >
                                      Record Cash Paid
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleSetFeeOverdue(m)}
                                      className="rounded border border-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:border-red-500/50 hover:text-red-300"
                                    >
                                      Mark Overdue
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TRAINER MANAGEMENT CRUD TAB */}
              {activeTab === 'trainers' && (
                <div className="space-y-6">
                  <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 px-6 py-4">
                      <div>
                        <h2 className="font-display text-xl font-bold text-white">
                          Coaching Staff Roster &amp; Performance
                        </h2>
                        <p className="text-xs text-zinc-400">
                          Add new coaches, edit trainer profiles and ratings, or remove departed records
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={openAddTrainerModal}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-500 whitespace-nowrap"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add New Trainer</span>
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[820px] text-left text-sm">
                        <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                          <tr>
                            <th className="px-5 py-3">Coach</th>
                            <th className="px-5 py-3">Certifications &amp; Exp</th>
                            <th className="px-5 py-3 text-right">Clients</th>
                            <th className="px-5 py-3 text-right">Sessions / Mo</th>
                            <th className="px-5 py-3 text-right">Retention</th>
                            <th className="px-5 py-3 text-right">Rating</th>
                            <th className="px-5 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/70">
                          {data.trainers.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-5 py-10 text-center text-xs text-zinc-500">
                                No trainers registered yet. Click &ldquo;Add New Trainer&rdquo; to
                                add a coach to FitBase.
                              </td>
                            </tr>
                          ) : (
                            data.trainers.map((t) => (
                              <tr key={t.id} className="hover:bg-zinc-900/40">
                                <td className="px-5 py-4">
                                  <p className="font-semibold text-white">{t.name}</p>
                                  <p className="text-xs text-zinc-400">{t.specialty}</p>
                                </td>
                                <td className="px-5 py-4 text-xs text-zinc-300">
                                  <p>{t.certifications || '—'}</p>
                                  <p className="font-mono text-[11px] text-zinc-500">
                                    {t.experienceYears} yrs exp · {t.attendanceCompletionRate}%
                                    completion
                                  </p>
                                </td>
                                <td className="px-5 py-4 text-right font-mono text-xs text-zinc-200 tabular-nums">
                                  {t.activeClients}
                                </td>
                                <td className="px-5 py-4 text-right font-mono text-xs text-zinc-200 tabular-nums">
                                  {t.sessionsThisMonth}
                                </td>
                                <td className="px-5 py-4 text-right font-mono text-xs text-zinc-200 tabular-nums">
                                  {t.clientRetentionRate}%
                                </td>
                                <td className="px-5 py-4 text-right font-mono text-xs font-semibold text-yellow-400 tabular-nums">
                                  {t.rating.toFixed(1)}
                                </td>
                                <td className="px-5 py-4 text-right">
                                  <div className="inline-flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => openTrainerEditor(t)}
                                      className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:border-red-500"
                                    >
                                      Edit Profile
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeletingTrainer(t)}
                                      aria-label={`Delete ${t.name}`}
                                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-600/10 px-2.5 py-1.5 text-xs font-medium text-red-300 hover:bg-red-600/20"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      <span>Delete</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Trainer Bio & Evaluation Notes Cards */}
                  {data.trainers.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {data.trainers.map((t) => (
                        <div
                          key={t.id}
                          className="rounded-xl border border-zinc-800 bg-[#111114] p-5 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-semibold text-white">{t.name}</h3>
                            <span className="font-mono text-xs text-zinc-500">
                              Evaluated {formatShortDate(t.lastEvaluatedAt)}
                            </span>
                          </div>
                          {t.bio && <p className="text-xs text-zinc-400">{t.bio}</p>}
                          <p className="text-xs leading-relaxed text-zinc-300">
                            {t.adminReviewNote || 'No evaluation notes logged yet.'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* FEEDBACK INBOX TAB */}
              {activeTab === 'feedback' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-800 bg-[#111114] p-1 w-fit">
                    {(['All', 'Open', 'In Review', 'Resolved'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setFbFilter(status)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          fbFilter === status
                            ? 'bg-red-600 text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-4">
                    {filteredFeedback.length === 0 ? (
                      <div className="rounded-xl border border-zinc-800 bg-[#111114] p-8 text-center text-sm text-zinc-400">
                        No feedback items in this status filter.
                      </div>
                    ) : (
                      filteredFeedback.map((item) => {
                        const currentStatus = statusDrafts[item.id] || item.status;
                        const currentReply = replyDrafts[item.id] ?? item.adminReply ?? '';

                        return (
                          <div
                            key={item.id}
                            className="rounded-xl border border-zinc-800 bg-[#111114] p-6 space-y-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                                  <span className="font-semibold text-white">
                                    {item.authorName}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>{item.authorEmail}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{item.category}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono text-yellow-400">
                                    Rating {item.rating}/5
                                  </span>
                                </div>
                                <p className="mt-2 text-sm text-zinc-100">{item.message}</p>
                              </div>
                              <span className="font-mono text-xs text-zinc-500">
                                {formatDateTime(item.createdAt)}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 gap-3 border-t border-zinc-800 pt-4 sm:grid-cols-12">
                              <div className="sm:col-span-3">
                                <label className="block text-[11px] text-zinc-400">Status</label>
                                <select
                                  value={currentStatus}
                                  onChange={(e) =>
                                    setStatusDrafts((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value as FeedbackEntry['status'],
                                    }))
                                  }
                                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                                >
                                  <option value="Open">Open</option>
                                  <option value="In Review">In Review</option>
                                  <option value="Resolved">Resolved</option>
                                </select>
                              </div>

                              <div className="sm:col-span-7">
                                <label className="block text-[11px] text-zinc-400">
                                  Management Response
                                </label>
                                <input
                                  type="text"
                                  value={currentReply}
                                  onChange={(e) =>
                                    setReplyDrafts((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Write official reply to member..."
                                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                                />
                              </div>

                              <div className="flex items-end sm:col-span-2">
                                <button
                                  type="button"
                                  onClick={() => handleSaveFeedback(item)}
                                  className="w-full rounded-lg bg-zinc-100 py-2 text-xs font-semibold text-zinc-950 hover:bg-white"
                                >
                                  Save Update
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </main>

      {/* Receipt Inspection & Approval Modal */}
      {inspectingPayment && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-[#111114] p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-zinc-800 pb-4">
              <div>
                <h3 className="font-display text-2xl font-bold text-white">
                  Inspect Payment Verification
                </h3>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {inspectingPayment.memberName} ({inspectingPayment.memberCode}) ·{' '}
                  {inspectingPayment.membershipTier} · Billing {inspectingPayment.billingMonth}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingPayment(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-12">
              <div className="md:col-span-7 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                {inspectingPayment.receiptUrl ? (
                  inspectingPayment.receiptUrl.endsWith('.pdf') ? (
                    <div className="flex h-64 items-center justify-center p-6">
                      <a
                        href={inspectingPayment.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold text-red-400 underline"
                      >
                        Open Uploaded PDF Slip ({inspectingPayment.receiptFileName})
                      </a>
                    </div>
                  ) : (
                    <img
                      src={inspectingPayment.receiptUrl}
                      alt={`Receipt ${inspectingPayment.transactionRef}`}
                      className="h-64 w-full object-contain"
                    />
                  )
                ) : (
                  <div className="flex h-64 items-center justify-center p-6 text-center text-xs text-zinc-500">
                    No digital image uploaded (Cash Front Desk submission).
                  </div>
                )}
              </div>

              <div className="md:col-span-5 flex flex-col justify-between space-y-4 text-xs">
                <div className="space-y-2.5">
                  <div>
                    <span className="text-zinc-500">Channel</span>
                    <p className="font-semibold text-white">{inspectingPayment.method}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Transaction Reference</span>
                    <p className="font-mono text-yellow-400">{inspectingPayment.transactionRef}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Amount Claimed</span>
                    <p className="font-mono text-base font-bold text-white tabular-nums">
                      {formatPkr(inspectingPayment.amountPkr)}
                    </p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Member Notes</span>
                    <p className="text-zinc-300">{inspectingPayment.notes || '—'}</p>
                  </div>
                  <div>
                    <label className="block text-zinc-400">Admin Verification Remark</label>
                    <input
                      type="text"
                      value={adminRemark}
                      onChange={(e) => setAdminRemark(e.target.value)}
                      placeholder="e.g. TID verified on JazzCash portal"
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    disabled={reviewBusy}
                    onClick={() => handleReviewPayment('approve')}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Approve</span>
                  </button>
                  <button
                    type="button"
                    disabled={reviewBusy}
                    onClick={() => handleReviewPayment('reject')}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/50 bg-red-600/15 py-2.5 text-xs font-semibold text-red-300 hover:bg-red-600/25"
                  >
                    <XCircle className="h-4 w-4" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Trainer Modal */}
      {trainerModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editingTrainer ? `Edit ${editingTrainer.name}` : 'Add New Trainer'}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={handleSaveTrainer}
            className="my-auto w-full max-w-xl rounded-2xl border border-zinc-800 bg-[#111114] p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="font-display text-2xl font-bold text-white">
                  {editingTrainer ? `Edit Trainer: ${editingTrainer.name}` : 'Add New Trainer'}
                </h3>
                <p className="text-xs text-zinc-400">
                  Manage public coach profile details and monthly performance metrics
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTrainerModalOpen(false);
                  setEditingTrainer(null);
                }}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-zinc-300">Full Name *</label>
                <input
                  type="text"
                  required
                  value={trName}
                  onChange={(e) => setTrName(e.target.value)}
                  placeholder="Coach Full Name"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-300">Primary Specialty *</label>
                <input
                  type="text"
                  required
                  value={trSpecialty}
                  onChange={(e) => setTrSpecialty(e.target.value)}
                  placeholder="e.g. Strength & Hypertrophy"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-300">Certifications</label>
                <input
                  type="text"
                  value={trCerts}
                  onChange={(e) => setTrCerts(e.target.value)}
                  placeholder="e.g. CSCS, NASM-CPT"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-zinc-300">Exp (Years)</label>
                  <input
                    type="number"
                    min="0"
                    value={trExpYears}
                    onChange={(e) => setTrExpYears(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-300">Active Clients</label>
                  <input
                    type="number"
                    min="0"
                    value={trActiveClients}
                    onChange={(e) => setTrActiveClients(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-300">Portrait Style Preset</label>
                <select
                  value={trPortraitKey}
                  onChange={(e) => setTrPortraitKey(e.target.value as TrainerPortraitKey)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                >
                  <option value="default">Monogram Initials Card</option>
                  <option value="coach_bilal">Strength Coach Portrait</option>
                  <option value="coach_ayesha">Female Conditioning Portrait</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-300">Custom Portrait URL (Optional)</label>
                <input
                  type="url"
                  value={trPortraitUrl}
                  onChange={(e) => setTrPortraitUrl(e.target.value)}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-300">Public Coach Bio</label>
              <textarea
                rows={2}
                value={trBio}
                onChange={(e) => setTrBio(e.target.value)}
                placeholder="Coaching background and athlete focus..."
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-zinc-800 pt-3 sm:grid-cols-4">
              <div>
                <label className="block text-xs text-zinc-400">Sessions / Mo</label>
                <input
                  type="number"
                  min="0"
                  value={trSessions}
                  onChange={(e) => setTrSessions(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400">Completion (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={trAttendance}
                  onChange={(e) => setTrAttendance(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400">Retention (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={trRetention}
                  onChange={(e) => setTrRetention(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400">Rating (1–5)</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  value={trRating}
                  onChange={(e) => setTrRating(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400">Management Review Note</label>
              <textarea
                rows={2}
                value={trNote}
                onChange={(e) => setTrNote(e.target.value)}
                placeholder="Internal evaluation remarks..."
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setTrainerModalOpen(false);
                  setEditingTrainer(null);
                }}
                className="flex-1 rounded-lg border border-zinc-700 py-2.5 text-xs font-medium text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={trBusy}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
              >
                {trBusy ? 'Saving...' : editingTrainer ? 'Save Changes' : 'Create Trainer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Trainer Confirmation Modal */}
      {deletingTrainer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Trainer Deletion"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#111114] p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-bold text-white">Delete Trainer Record</h3>
                <p className="mt-1 text-xs text-zinc-400">
                  Remove <strong className="text-white">{deletingTrainer.name}</strong> (
                  {deletingTrainer.specialty}) from the FitBase database and public coaching roster?
                  This action cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeletingTrainer(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingTrainer(null)}
                className="flex-1 rounded-lg border border-zinc-700 py-2.5 text-xs font-medium text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={trBusy}
                onClick={handleConfirmDeleteTrainer}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
              >
                {trBusy ? 'Deleting...' : 'Delete Trainer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

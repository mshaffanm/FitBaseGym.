import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Copy,
  CreditCard,
  Edit3,
  ExternalLink,
  Eye,
  Fingerprint,
  KeyRound,
  Lock,
  MessageCircle,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Usb,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import { api, getAuthToken } from '../api';
import {
  captureFromLocalBridge,
  captureFromUsbReader,
  checkPlatformBiometricAvailable,
  connectLocalBridgeWebSocket,
  detectHardwareCapabilities,
  enrollWebAuthnBiometric,
  getAuthorizedUsbReaders,
  probeLocalScannerBridge,
  requestUsbFingerprintDevice,
  verifyWebAuthnBiometric,
  type BridgeProbeStatus,
  type HardwareCaptureResult,
  type ScannerConnectionMode,
  type UsbReaderHandle,
} from '../services/biometricScanner';
import {
  FeeStatusText,
  formatDateTime,
  formatPkr,
  formatShortDate,
  PaymentStatusText,
} from './Brand';
import type {
  BiometricSummary,
  BiometricVendor,
  BiometricVerifyResult,
  MembershipTier,
  PasswordResetRequest,
  PaymentMethod,
  PaymentSubmission,
  ReceptionOverviewPayload,
  UserProfile,
} from '../types';

export type ReceptionSubView =
  | 'checkin'
  | 'dues'
  | 'profiles'
  | 'resets'
  | 'attendance'
  | 'notifications';

interface ReceptionWorkspaceProps {
  activeView: ReceptionSubView;
  onChangeView: (view: ReceptionSubView) => void;
  onDataChanged?: () => void;
}

const TIER_RATES: Record<MembershipTier, number> = {
  'Student Package': 6000,
  'Official Package': 7000,
  '3 Months Package': 16000,
  '6 Months Package': 30000,
  '12 Months Package': 50000,
};

function defaultEndDate30Days(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

function getDaysRemaining(endDateStr: string): number {
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = new Date(`${todayStr}T00:00:00Z`).getTime();
  const end = new Date(`${endDateStr}T00:00:00Z`).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.round((end - today) / 86_400_000);
}

const VENDORS: BiometricVendor[] = [
  'ZKTeco SLK20R',
  'SecuGen Hamster Pro 20',
  'DigitalPersona U.are.U 4500',
  'WebAuthn Platform Sensor',
];

const FINGERS = ['Right Index', 'Right Thumb', 'Left Index', 'Left Thumb'] as const;

export function ReceptionWorkspace({
  activeView,
  onChangeView,
  onDataChanged,
}: ReceptionWorkspaceProps) {
  const [data, setData] = useState<ReceptionOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Hardware Scanner State (Real Physical Reader Integration Only)
  const [scannerMode, setScannerMode] = useState<ScannerConnectionMode>('local_bridge');
  const [selectedVendor, setSelectedVendor] = useState<BiometricVendor>('ZKTeco SLK20R');
  const [bridgeUrl, setBridgeUrl] = useState('http://127.0.0.1:8181');
  const [bridgeStatus, setBridgeStatus] = useState<BridgeProbeStatus | null>(null);
  const [probeBusy, setProbeBusy] = useState(false);
  const [pairedUsbReader, setPairedUsbReader] = useState<UsbReaderHandle | null>(null);
  const [platformBioReady, setPlatformBioReady] = useState(false);
  const [checkInZone, setCheckInZone] = useState('Main Turnstile Entry');
  const [scanBusy, setScanBusy] = useState(false);
  const [liveAutoListen, setLiveAutoListen] = useState(false);
  const [wsStreamActive, setWsStreamActive] = useState(false);
  const [lastHardwareError, setLastHardwareError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<BiometricVerifyResult | null>(null);
  const autoListenAbortRef = useRef<AbortController | null>(null);

  // Receipt inspection & discrepancy resolution modals
  const [inspectingPayment, setInspectingPayment] = useState<PaymentSubmission | null>(null);
  const [adminRemark, setAdminRemark] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

  const [resolveMember, setResolveMember] = useState<UserProfile | null>(null);
  const [resolveMethod, setResolveMethod] = useState<PaymentMethod>('Cash');
  const [resolveRef, setResolveRef] = useState('');
  const [resolveBusy, setResolveBusy] = useState(false);

  // Member Profile Create / Edit + Biometric Enrollment Modals
  const [memberSearch, setMemberSearch] = useState('');
  const [bioFilter, setBioFilter] = useState<'All' | 'Enrolled' | 'Not Enrolled' | 'Suspended'>('All');
  const [showNewMemberModal, setShowNewMemberModal] = useState(false);
  const [editingMember, setEditingMember] = useState<UserProfile | null>(null);
  const [enrollingMember, setEnrollingMember] = useState<UserProfile | null>(null);

  // New / Edit Member fields + Initial Registration Hardware Biometric Capture
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formTier, setFormTier] = useState<MembershipTier>('Official Package');
  const [formDiscountPkr, setFormDiscountPkr] = useState('0');
  const [formDiscountReason, setFormDiscountReason] = useState('');
  const [formSubscriptionEndDate, setFormSubscriptionEndDate] = useState(defaultEndDate30Days());
  const [formTrainerId, setFormTrainerId] = useState('');
  const [formEmergency, setFormEmergency] = useState('');
  const [formCnic4, setFormCnic4] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [regBioVendor, setRegBioVendor] = useState<BiometricVendor>('ZKTeco SLK20R');
  const [regBioFinger, setRegBioFinger] = useState<(typeof FINGERS)[number]>('Right Index');
  const [regBioCapture, setRegBioCapture] = useState<HardwareCaptureResult | null>(null);
  const [regBioBusy, setRegBioBusy] = useState(false);
  const [regBioError, setRegBioError] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);

  // Renewals & WhatsApp Notification Settings
  const [cronTime, setCronTime] = useState('09:00');
  const [reminderDays, setReminderDays] = useState('5');
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [sweepBusy, setSweepBusy] = useState(false);
  const [sendingMemberId, setSendingMemberId] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);

  // Biometric Enrollment Modal fields (live hardware capture required)
  const [enrollFinger, setEnrollFinger] = useState<(typeof FINGERS)[number]>('Right Index');
  const [enrollVendor, setEnrollVendor] = useState<BiometricVendor>('ZKTeco SLK20R');
  const [enrollCapture, setEnrollCapture] = useState<HardwareCaptureResult | null>(null);
  const [enrollCaptureBusy, setEnrollCaptureBusy] = useState(false);
  const [enrollCaptureError, setEnrollCaptureError] = useState<string | null>(null);
  const [enrollBusy, setEnrollBusy] = useState(false);

  // Member Password Reset Management State
  const [resetTargetRequest, setResetTargetRequest] = useState<PasswordResetRequest | null>(null);
  const [resetTargetMember, setResetTargetMember] = useState<UserProfile | null>(null);
  const [resetCustomPassword, setResetCustomPassword] = useState('');
  const [resetNoteInput, setResetNoteInput] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSearch, setResetSearch] = useState('');
  const [issuedTempCredential, setIssuedTempCredential] = useState<{
    memberName: string;
    memberCode: string;
    email: string;
    temporaryPassword: string;
    whatsappDeepLink: string;
  } | null>(null);
  const [copiedTempPass, setCopiedTempPass] = useState(false);

  const hwCaps = useMemo(() => detectHardwareCapabilities(), []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const fetchReception = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await api.getReceptionOverview();
      setData(payload);
      if (payload.notificationSettings) {
        setCronTime(payload.notificationSettings.dailyCronTime);
        setReminderDays(String(payload.notificationSettings.reminderDaysBefore));
        setWhatsappEnabled(payload.notificationSettings.whatsappEnabled);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reception data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReception();
  }, [fetchReception]);

  const refreshAll = useCallback(async () => {
    await fetchReception();
    onDataChanged?.();
  }, [fetchReception, onDataChanged]);

  const runBridgeProbe = useCallback(async (urlToProbe?: string) => {
    setProbeBusy(true);
    try {
      const status = await probeLocalScannerBridge(urlToProbe ?? bridgeUrl);
      setBridgeStatus(status);
      return status;
    } finally {
      setProbeBusy(false);
    }
  }, [bridgeUrl]);

  // Discover physical USB readers, platform biometric hardware, and local SDK bridge on load
  useEffect(() => {
    void runBridgeProbe(bridgeUrl);
    void getAuthorizedUsbReaders().then((readers) => {
      if (readers.length > 0) setPairedUsbReader(readers[0]);
    });
    void checkPlatformBiometricAvailable().then((avail) => {
      setPlatformBioReady(avail);
    });
  }, [bridgeUrl, runBridgeProbe]);

  // Subscribe to Server-Sent Hardware Push Stream so external turnstile/SDK agents update the UI live
  useEffect(() => {
    const token = getAuthToken();
    if (!token || typeof EventSource === 'undefined') return;
    const es = new EventSource(`/api/reception/biometric/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener('scan-verified', (evt) => {
      try {
        const result = JSON.parse((evt as MessageEvent).data) as BiometricVerifyResult;
        setVerifyResult(result);
        void refreshAll();
        showToast(
          `Hardware check-in: ${result.member.name} (${result.member.memberCode}) · ${result.attendanceEntry.accessOutcome}`
        );
      } catch {
        // Ignore parse error
      }
    });
    return () => {
      es.close();
    };
  }, [refreshAll, showToast]);

  const handlePairUsb = async () => {
    setLastHardwareError(null);
    try {
      const reader = await requestUsbFingerprintDevice();
      setPairedUsbReader(reader);
      setScannerMode('webusb');
      showToast(`Paired physical USB scanner: ${reader.displayName} (${reader.serialNumber})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to pair USB fingerprint reader.';
      setLastHardwareError(msg);
      showToast(msg);
    }
  };

  /**
   * Executes a real biometric hardware capture using the active physical scanner interface.
   * No synthetic fallback or emulator paths exist.
   */
  const performLiveHardwareCapture = useCallback(
    async (
      mode: ScannerConnectionMode,
      vendor: BiometricVendor,
      memberContext?: { memberCode?: string; memberName?: string },
      intent: 'enroll' | 'verify' = 'verify',
      signal?: AbortSignal
    ): Promise<HardwareCaptureResult> => {
      if (mode === 'local_bridge') {
        return captureFromLocalBridge(bridgeUrl, vendor, { timeoutMs: 10000, signal });
      }

      if (mode === 'webusb') {
        let reader = pairedUsbReader;
        if (!reader) {
          reader = await requestUsbFingerprintDevice();
          setPairedUsbReader(reader);
        }
        return captureFromUsbReader(reader, vendor);
      }

      // WebAuthn Hardware Biometric Sensor
      const enrolledCredIds = (data?.biometrics || [])
        .map((b) => b.credentialId)
        .filter((id): id is string => Boolean(id && id.length >= 16));

      if (intent === 'enroll') {
        return enrollWebAuthnBiometric({
          memberCode: memberContext?.memberCode || `FB-NEW-${Date.now().toString().slice(-4)}`,
          memberName: memberContext?.memberName || 'New FitBase Member',
          existingCredentialIds: enrolledCredIds,
        });
      }

      return verifyWebAuthnBiometric(enrolledCredIds);
    },
    [bridgeUrl, data?.biometrics, pairedUsbReader]
  );

  const submitCapturedVerification = useCallback(
    async (capture: HardwareCaptureResult) => {
      const result = await api.verifyBiometricCheckIn({
        rawSignal: capture.rawSignal,
        credentialId: capture.credentialId,
        deviceName: capture.deviceName,
        hardwareSerial: capture.hardwareSerial,
        captureProtocol: capture.captureProtocol,
        zoneOrClass: checkInZone,
        matchConfidence: capture.matchConfidence,
      });

      setVerifyResult(result);
      setLastHardwareError(null);
      await refreshAll();
      showToast(
        `Verified ${result.member.name} (${result.member.memberCode}) · ${result.attendanceEntry.accessOutcome}`
      );
    },
    [checkInZone, refreshAll, showToast]
  );

  const handleTriggerScan = async () => {
    setScanBusy(true);
    setError('');
    setLastHardwareError(null);
    try {
      const capture = await performLiveHardwareCapture(
        scannerMode,
        selectedVendor,
        undefined,
        'verify'
      );
      await submitCapturedVerification(capture);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fingerprint verification failed.';
      setLastHardwareError(msg);
      setError(msg);
      showToast(msg);
    } finally {
      setScanBusy(false);
    }
  };

  // Real-time continuous hardware listener (WebSocket stream + HTTP long-poll capture loop)
  useEffect(() => {
    if (!liveAutoListen || scannerMode !== 'local_bridge') {
      autoListenAbortRef.current?.abort();
      autoListenAbortRef.current = null;
      setWsStreamActive(false);
      return;
    }

    let cancelled = false;
    const disconnectWs = connectLocalBridgeWebSocket(bridgeUrl, selectedVendor, {
      onCapture: (capture) => {
        if (cancelled) return;
        void submitCapturedVerification(capture).catch((err) => {
          const msg = err instanceof Error ? err.message : 'Scan verification failed.';
          setLastHardwareError(msg);
          showToast(msg);
        });
      },
      onStatusChange: (connected) => {
        if (!cancelled) setWsStreamActive(connected);
      },
    });

    const pollLoop = async () => {
      while (!cancelled) {
        if (wsStreamActive) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        const controller = new AbortController();
        autoListenAbortRef.current = controller;
        try {
          const capture = await captureFromLocalBridge(bridgeUrl, selectedVendor, {
            timeoutMs: 8000,
            signal: controller.signal,
          });
          if (!cancelled) {
            await submitCapturedVerification(capture);
          }
        } catch (err) {
          if (cancelled) break;
          const msg = err instanceof Error ? err.message : '';
          // If finger timed out waiting, silently re-arm next capture window
          if (!msg.toLowerCase().includes('timed out') && !msg.toLowerCase().includes('abort')) {
            setLastHardwareError(msg);
            await new Promise((r) => setTimeout(r, 2500));
          }
        }
      }
    };

    void pollLoop();

    return () => {
      cancelled = true;
      autoListenAbortRef.current?.abort();
      autoListenAbortRef.current = null;
      disconnectWs();
      setWsStreamActive(false);
    };
  }, [bridgeUrl, liveAutoListen, scannerMode, selectedVendor, showToast, submitCapturedVerification, wsStreamActive]);

  const handleReviewPayment = async (action: 'approve' | 'reject') => {
    if (!inspectingPayment) return;
    setReviewBusy(true);
    try {
      await api.reviewPayment(inspectingPayment.id, action, adminRemark);
      const reviewedMemberId = inspectingPayment.memberId;
      setInspectingPayment(null);
      await refreshAll();

      // Update active scan card if it belongs to the same member
      if (verifyResult && verifyResult.member.id === reviewedMemberId) {
        setVerifyResult((prev) =>
          prev
            ? {
                ...prev,
                member: {
                  ...prev.member,
                  feeStatus: action === 'approve' ? 'Paid' : 'Overdue',
                },
                pendingPayments: [],
                alertLevel: action === 'approve' ? 'clear' : 'overdue',
                alertMessage:
                  action === 'approve'
                    ? 'Payment approved at desk. Monthly fee cleared.'
                    : 'Payment rejected. Member due remains Overdue.',
              }
            : null
        );
      }
      showToast(
        action === 'approve'
          ? 'Receipt approved and member fee cleared.'
          : 'Receipt rejected and member flagged Overdue.'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to review payment.');
    } finally {
      setReviewBusy(false);
    }
  };

  const handleResolveMemberDue = async (e: FormEvent) => {
    e.preventDefault();
    if (!resolveMember) return;
    setResolveBusy(true);
    try {
      const res = await api.updateMemberFeeStatus(resolveMember.id, {
        recordCashPayment: true,
        paymentMethod: resolveMethod,
        transactionRef: resolveRef,
      });
      setResolveMember(null);
      setResolveRef('');
      await refreshAll();

      if (verifyResult && verifyResult.member.id === res.member.id) {
        setVerifyResult((prev) =>
          prev
            ? {
                ...prev,
                member: res.member,
                pendingPayments: [],
                alertLevel: 'clear',
                alertMessage: `${resolveMethod} payment recorded at reception desk. Monthly fee is now Paid.`,
              }
            : null
        );
      }
      showToast(`Recorded ${resolveMethod} payment for ${res.member.name}. Status updated to Paid.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to resolve fee.');
    } finally {
      setResolveBusy(false);
    }
  };

  const openNewMemberModal = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormTier('Official Package');
    setFormDiscountPkr('0');
    setFormDiscountReason('');
    setFormSubscriptionEndDate(defaultEndDate30Days());
    setFormTrainerId(data?.trainers[0]?.id || '');
    setFormEmergency('');
    setFormCnic4('');
    setFormNotes('');
    setRegBioVendor(selectedVendor);
    setRegBioFinger('Right Index');
    setRegBioCapture(null);
    setRegBioError(null);
    setShowNewMemberModal(true);
  };

  const handleCaptureRegistrationPrint = async () => {
    setRegBioBusy(true);
    setRegBioError(null);
    try {
      const cap = await performLiveHardwareCapture(
        scannerMode,
        regBioVendor,
        {
          memberCode: `FB-REG-${Date.now().toString().slice(-4)}`,
          memberName: formName.trim() || 'New FitBase Member',
        },
        'enroll'
      );
      setRegBioCapture(cap);
      showToast(`Captured ${regBioFinger} biometric frame (${cap.qualityScore}% quality).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Hardware capture failed.';
      setRegBioError(msg);
      showToast(msg);
    } finally {
      setRegBioBusy(false);
    }
  };

  const openEditMemberModal = (m: UserProfile) => {
    setEditingMember(m);
    setFormName(m.name);
    setFormEmail(m.email);
    setFormPhone(m.phone);
    setFormTier(m.membershipTier);
    setFormDiscountPkr(String(m.discountPkr || 0));
    setFormDiscountReason(m.discountReason || '');
    setFormSubscriptionEndDate(m.subscriptionEndDate || defaultEndDate30Days());
    setFormTrainerId(m.assignedTrainerId || data?.trainers[0]?.id || '');
    setFormEmergency(m.emergencyContact || '');
    setFormCnic4(m.cnicLast4 || '');
    setFormNotes(m.staffNotes || '');
    setFormActive(m.membershipActive !== false);
  };

  const parsedDiscountNum = Math.min(
    TIER_RATES[formTier],
    Math.max(0, Math.round(Number(formDiscountPkr) || 0))
  );
  const computedFinalFeePkr = Math.max(0, TIER_RATES[formTier] - parsedDiscountNum);

  const handleCreateMember = async (e: FormEvent) => {
    e.preventDefault();
    setProfileBusy(true);
    try {
      const res = await api.createMemberProfile({
        name: formName,
        email: formEmail,
        phone: formPhone,
        membershipTier: formTier,
        discountPkr: parsedDiscountNum,
        discountReason: formDiscountReason,
        subscriptionEndDate: formSubscriptionEndDate,
        assignedTrainerId: formTrainerId,
        emergencyContact: formEmergency,
        cnicLast4: formCnic4,
        staffNotes: formNotes,
        ...(regBioCapture
          ? {
              biometricCapture: {
                sensorVendor: regBioVendor,
                fingerLabel: regBioFinger,
                rawSignal: regBioCapture.rawSignal,
                qualityScore: regBioCapture.qualityScore,
                hardwareSerial: regBioCapture.hardwareSerial,
                captureProtocol: regBioCapture.captureProtocol,
                templateFormat: regBioCapture.templateFormat,
                credentialId: regBioCapture.credentialId,
              },
            }
          : {}),
      });
      setShowNewMemberModal(false);
      setRegBioCapture(null);
      await refreshAll();
      showToast(
        `Created ${res.member.name} (${res.member.memberCode}) · Fee ${formatPkr(
          res.member.monthlyFeePkr
        )}/mo${res.biometric ? ` · Biometric Enrolled (${res.biometric.fingerLabel})` : ''}.`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to create member.');
    } finally {
      setProfileBusy(false);
    }
  };

  const handleUpdateMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setProfileBusy(true);
    try {
      await api.updateMemberProfile(editingMember.id, {
        name: formName,
        phone: formPhone,
        membershipTier: formTier,
        discountPkr: parsedDiscountNum,
        discountReason: formDiscountReason,
        subscriptionEndDate: formSubscriptionEndDate,
        assignedTrainerId: formTrainerId,
        emergencyContact: formEmergency,
        cnicLast4: formCnic4,
        membershipActive: formActive,
        staffNotes: formNotes,
      });
      setEditingMember(null);
      await refreshAll();
      showToast(`Updated profile for ${formName}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to update member.');
    } finally {
      setProfileBusy(false);
    }
  };

  const handleRunDailySweep = async () => {
    setSweepBusy(true);
    try {
      const res = await api.runNotificationSweep();
      await refreshAll();
      showToast(
        `Subscription sweep complete: ${res.dispatchedCount} renewal reminder(s) dispatched.`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to run notification sweep.');
    } finally {
      setSweepBusy(false);
    }
  };

  const handleSendWhatsAppReminder = async (member: UserProfile) => {
    setSendingMemberId(member.id);
    try {
      const res = await api.sendMemberWhatsAppReminder(member.id);
      await refreshAll();
      showToast(`WhatsApp reminder queued (${res.log.deliveryStatus}) for ${member.name}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to send reminder.');
    } finally {
      setSendingMemberId(null);
    }
  };

  const handleSaveNotificationSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSettingsBusy(true);
    try {
      await api.updateNotificationSettings({
        reminderDaysBefore: Number(reminderDays) || 5,
        dailyCronTime: cronTime,
        whatsappEnabled,
      });
      await refreshAll();
      showToast('Daily renewal schedule & WhatsApp settings saved.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSettingsBusy(false);
    }
  };

  const openEnrollModal = (m: UserProfile) => {
    setEnrollingMember(m);
    setEnrollVendor(selectedVendor);
    setEnrollFinger('Right Index');
    setEnrollCapture(null);
    setEnrollCaptureError(null);
  };

  const handleCaptureEnrollPrint = async () => {
    if (!enrollingMember) return;
    setEnrollCaptureBusy(true);
    setEnrollCaptureError(null);
    try {
      const cap = await performLiveHardwareCapture(
        scannerMode,
        enrollVendor,
        {
          memberCode: enrollingMember.memberCode,
          memberName: enrollingMember.name,
        },
        'enroll'
      );
      setEnrollCapture(cap);
      showToast(
        `Captured ${enrollFinger} print for ${enrollingMember.memberCode} (${cap.qualityScore}% quality).`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to capture print from hardware.';
      setEnrollCaptureError(msg);
      showToast(msg);
    } finally {
      setEnrollCaptureBusy(false);
    }
  };

  const handleEnrollFingerprint = async (e: FormEvent) => {
    e.preventDefault();
    if (!enrollingMember) return;
    setEnrollBusy(true);
    setEnrollCaptureError(null);
    try {
      const capture =
        enrollCapture ||
        (await performLiveHardwareCapture(
          scannerMode,
          enrollVendor,
          {
            memberCode: enrollingMember.memberCode,
            memberName: enrollingMember.name,
          },
          'enroll'
        ));

      await api.enrollBiometric({
        memberId: enrollingMember.id,
        sensorVendor: enrollVendor,
        fingerLabel: enrollFinger,
        rawSignal: capture.rawSignal,
        qualityScore: capture.qualityScore,
        hardwareSerial: capture.hardwareSerial,
        captureProtocol: capture.captureProtocol,
        templateFormat: capture.templateFormat,
        credentialId: capture.credentialId,
      });
      setEnrollingMember(null);
      setEnrollCapture(null);
      await refreshAll();
      showToast(
        `Enrolled ${enrollFinger} hardware template for ${enrollingMember.name} (${enrollingMember.memberCode}).`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Biometric enrollment failed.';
      setEnrollCaptureError(msg);
      showToast(msg);
    } finally {
      setEnrollBusy(false);
    }
  };

  const handleToggleBioStatus = async (m: UserProfile, bio?: BiometricSummary) => {
    const nextStatus = bio?.enrollmentStatus === 'Suspended' ? 'Enrolled' : 'Suspended';
    try {
      await api.updateBiometricStatus(m.id, nextStatus);
      await refreshAll();
      showToast(`Biometric status for ${m.name} set to ${nextStatus}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Status update failed.');
    }
  };

  const dueAlerts = useMemo(() => {
    if (!data) return [];
    return data.members.filter((m) => m.feeStatus !== 'Paid');
  }, [data]);

  const rejectedPayments = useMemo(() => {
    if (!data) return [];
    return data.payments.filter((p) => p.status === 'Rejected');
  }, [data]);

  const filteredMembers = useMemo(() => {
    if (!data) return [];
    const q = memberSearch.trim().toLowerCase();
    return data.members.filter((m) => {
      const bioMatch = bioFilter === 'All' || (m.biometricStatus || 'Not Enrolled') === bioFilter;
      const textMatch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.memberCode.toLowerCase().includes(q) ||
        m.phone.toLowerCase().includes(q);
      return bioMatch && textMatch;
    });
  }, [data, memberSearch, bioFilter]);

  const expiringMembers = useMemo(() => {
    if (!data) return [];
    const windowDays = data.notificationSettings?.reminderDaysBefore ?? 5;
    return data.members
      .map((m) => ({
        member: m,
        daysRemaining: getDaysRemaining(m.subscriptionEndDate),
      }))
      .filter((item) => item.daysRemaining <= windowDays)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [data]);

  const pendingResetRequests = useMemo(() => {
    if (!data?.passwordResetRequests) return [];
    return data.passwordResetRequests.filter((r) => r.status === 'Pending');
  }, [data]);

  const resolvedResetRequests = useMemo(() => {
    if (!data?.passwordResetRequests) return [];
    return data.passwordResetRequests.filter((r) => r.status !== 'Pending');
  }, [data]);

  const resetDirectoryMembers = useMemo(() => {
    if (!data) return [];
    const q = resetSearch.trim().toLowerCase();
    return data.members.filter(
      (m) =>
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.memberCode.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.phone.toLowerCase().includes(q)
    );
  }, [data, resetSearch]);

  const openResetModalForRequest = (reqItem: PasswordResetRequest) => {
    const memberObj = data?.members.find((m) => m.id === reqItem.memberId) || null;
    setResetTargetRequest(reqItem);
    setResetTargetMember(memberObj);
    setResetCustomPassword('');
    setResetNoteInput('');
  };

  const openResetModalForMember = (memberObj: UserProfile) => {
    const pendingMatch =
      data?.passwordResetRequests.find(
        (r) => r.memberId === memberObj.id && r.status === 'Pending'
      ) || null;
    setResetTargetRequest(pendingMatch);
    setResetTargetMember(memberObj);
    setResetCustomPassword('');
    setResetNoteInput('');
  };

  const handleExecutePasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetTargetRequest && !resetTargetMember) return;
    setResetBusy(true);
    setCopiedTempPass(false);
    try {
      if (resetTargetRequest) {
        const res = await api.resolvePasswordReset(resetTargetRequest.id, {
          action: 'reset',
          newPassword: resetCustomPassword.trim() || undefined,
          resolutionNote: resetNoteInput.trim() || undefined,
        });
        if (res.temporaryPassword) {
          setIssuedTempCredential({
            memberName: res.request.memberName,
            memberCode: res.request.memberCode,
            email: res.request.email,
            temporaryPassword: res.temporaryPassword,
            whatsappDeepLink: res.whatsappDeepLink || '',
          });
        }
        showToast(
          `Password reset issued for ${res.request.memberName} (${res.request.memberCode}).`
        );
      } else if (resetTargetMember) {
        const res = await api.initiateMemberPasswordReset(resetTargetMember.id, {
          newPassword: resetCustomPassword.trim() || undefined,
          resolutionNote: resetNoteInput.trim() || undefined,
        });
        setIssuedTempCredential({
          memberName: res.member.name,
          memberCode: res.member.memberCode,
          email: res.member.email,
          temporaryPassword: res.temporaryPassword,
          whatsappDeepLink: res.whatsappDeepLink,
        });
        showToast(
          `Staff-initiated password reset issued for ${res.member.name} (${res.member.memberCode}).`
        );
      }
      setResetTargetRequest(null);
      setResetTargetMember(null);
      setResetCustomPassword('');
      setResetNoteInput('');
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to reset member password.');
    } finally {
      setResetBusy(false);
    }
  };

  const handleDismissResetRequest = async (reqItem: PasswordResetRequest) => {
    try {
      await api.resolvePasswordReset(reqItem.id, {
        action: 'dismiss',
        resolutionNote: 'Dismissed at reception desk.',
      });
      await refreshAll();
      showToast(`Dismissed reset request for ${reqItem.memberName}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to dismiss request.');
    }
  };

  const handleCopyTempPassword = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTempPass(true);
      window.setTimeout(() => setCopiedTempPass(false), 2500);
    } catch {
      showToast(`Temporary Password: ${text}`);
    }
  };

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="h-24 animate-pulse rounded-xl border border-zinc-800 bg-[#111114]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-navigation Bar inside Reception Workspace */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-800 bg-[#111114] p-1">
          {(
            [
              { id: 'checkin', label: 'Biometric Check-In' },
              { id: 'dues', label: `Pending Dues (${dueAlerts.length})` },
              { id: 'profiles', label: 'Member Profiles & Enrollment' },
              {
                id: 'resets',
                label: `Password Resets (${pendingResetRequests.length})`,
              },
              { id: 'attendance', label: 'Attendance Ledger' },
              {
                id: 'notifications',
                label: `Renewals & WhatsApp (${expiringMembers.length})`,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeView(tab.id)}
              className={`rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeView === tab.id
                  ? 'bg-red-600 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={openNewMemberModal}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-white whitespace-nowrap shrink-0"
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span>New Member Profile</span>
        </button>
      </div>

      {toast && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-xs font-medium text-white">
          {toast}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* KPI Strip */}
      {data && (
        <div className="grid grid-cols-1 divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-[#111114] sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
          <div className="p-5">
            <p className="text-xs text-zinc-400">Today&apos;s Check-Ins</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-white tabular-nums">
              {data.metrics.todayCheckIns}
            </p>
            <p className="mt-1 text-xs text-zinc-500 tabular-nums">
              {data.metrics.biometricCheckInsToday} via biometric reader
            </p>
          </div>
          <div className="p-5">
            <p className="text-xs text-zinc-400">Biometric Enrollment</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-white tabular-nums">
              {data.metrics.enrolledMembers} / {data.metrics.totalMembers}
            </p>
            <p className="mt-1 text-xs text-emerald-400">Templates SHA-256 salted</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-zinc-400">Pending &amp; Overdue Alerts</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-amber-400 tabular-nums">
              {data.metrics.overdueCount + data.metrics.pendingVerificationCount}
            </p>
            <p className="mt-1 text-xs text-zinc-500 tabular-nums">
              {data.metrics.overdueCount} overdue · {data.metrics.pendingVerificationCount} awaiting
              review
            </p>
          </div>
          <div className="p-5">
            <p className="text-xs text-zinc-400">Outstanding Dues</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-red-400 tabular-nums">
              {formatPkr(data.metrics.totalPendingDuesPkr)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Receivable for current cycle</p>
          </div>
        </div>
      )}

      {/* Pending Password Reset Desk Alert */}
      {data && pendingResetRequests.length > 0 && activeView !== 'resets' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs">
          <div className="flex items-center gap-2.5 text-amber-200">
            <KeyRound className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              <strong className="font-semibold text-white">
                {pendingResetRequests.length} Member Password Reset Request
                {pendingResetRequests.length > 1 ? 's' : ''}
              </strong>{' '}
              submitted from the Member Portal login screen waiting for reception clearance.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onChangeView('resets')}
            className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-zinc-950 hover:bg-amber-400 whitespace-nowrap"
          >
            Manage Resets
          </button>
        </div>
      )}

      {/* VIEW 1: LIVE BIOMETRIC CHECK-IN TERMINAL */}
      {activeView === 'checkin' && data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Hardware Scanner Terminal */}
          <div className="rounded-xl border border-zinc-800 bg-[#111114] p-6 space-y-5 lg:col-span-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">
                  Fingerprint Scanner Terminal
                </h2>
                <p className="text-xs text-zinc-400">
                  Verifies identity, logs attendance, and cross-references monthly dues
                </p>
              </div>
              <Fingerprint className="h-6 w-6 shrink-0 text-red-500" />
            </div>

            {/* Hardware Connection Selector */}
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-zinc-200">Reader Interface</span>
                <span className="font-mono text-[11px] text-zinc-500">
                  WebUSB: {hwCaps.webUsbSupported ? 'Available' : 'Unavailable'} · WebAuthn:{' '}
                  {hwCaps.webAuthnSupported ? 'Ready' : 'No'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setScannerMode('local_bridge');
                    setLastHardwareError(null);
                  }}
                  className={`rounded-md border px-2 py-2 text-center font-medium transition-colors ${
                    scannerMode === 'local_bridge'
                      ? 'border-red-500 bg-red-600/15 text-white'
                      : 'border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  Local SDK Bridge
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScannerMode('webusb');
                    setLiveAutoListen(false);
                    setLastHardwareError(null);
                  }}
                  className={`rounded-md border px-2 py-2 text-center font-medium transition-colors ${
                    scannerMode === 'webusb'
                      ? 'border-red-500 bg-red-600/15 text-white'
                      : 'border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  WebUSB Direct
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScannerMode('webauthn');
                    setLiveAutoListen(false);
                    setSelectedVendor('WebAuthn Platform Sensor');
                    setLastHardwareError(null);
                  }}
                  className={`rounded-md border px-2 py-2 text-center font-medium transition-colors ${
                    scannerMode === 'webauthn'
                      ? 'border-red-500 bg-red-600/15 text-white'
                      : 'border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  WebAuthn Sensor
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] text-zinc-400">Scanner Hardware</label>
                  <select
                    value={selectedVendor}
                    onChange={(e) => setSelectedVendor(e.target.value as BiometricVendor)}
                    className="mt-1 w-full rounded-md border border-zinc-800 bg-[#111114] px-2.5 py-1.5 text-xs text-white focus:border-red-500 focus:outline-none"
                  >
                    {VENDORS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400">Entry Gate / Zone</label>
                  <select
                    value={checkInZone}
                    onChange={(e) => setCheckInZone(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-800 bg-[#111114] px-2.5 py-1.5 text-xs text-white focus:border-red-500 focus:outline-none"
                  >
                    <option value="Main Turnstile Entry">Main Turnstile Entry</option>
                    <option value="Main Iron Rack Bay">Main Iron Rack Bay</option>
                    <option value="Sprint Turf Track">Sprint Turf Track</option>
                    <option value="Ladies Studio Entry">Ladies Studio Entry</option>
                  </select>
                </div>
              </div>

              {scannerMode === 'local_bridge' && (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-[11px] text-zinc-400">
                        Local SDK Service URL (ZKTeco ZKFinger / SecuGen SGIBioSrv / Bridge)
                      </label>
                      <input
                        type="url"
                        value={bridgeUrl}
                        onChange={(e) => setBridgeUrl(e.target.value)}
                        className="mt-1 w-full rounded-md border border-zinc-800 bg-[#111114] px-2.5 py-1.5 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={probeBusy}
                      onClick={() => void runBridgeProbe(bridgeUrl)}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-[#111114] px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 hover:border-zinc-500 whitespace-nowrap"
                    >
                      <RefreshCw className={`h-3 w-3 ${probeBusy ? 'animate-spin' : ''}`} />
                      <span>Probe</span>
                    </button>
                  </div>

                  {/* Hardware Agent Diagnostic Readout */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-800/90 bg-[#111114] px-3 py-2 text-[11px]">
                    <span
                      className={`font-medium ${
                        bridgeStatus?.online ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {bridgeStatus?.online
                        ? `Connected · ${bridgeStatus.deviceName || bridgeStatus.agentType}${
                            bridgeStatus.hardwareSerial ? ` (${bridgeStatus.hardwareSerial})` : ''
                          }`
                        : 'Bridge Offline — Start Local Hardware SDK Daemon'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLiveAutoListen((v) => !v)}
                      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 font-semibold transition-colors ${
                        liveAutoListen
                          ? 'bg-emerald-600 text-white'
                          : 'border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white'
                      }`}
                    >
                      <Radio className={`h-3 w-3 ${liveAutoListen ? 'animate-pulse' : ''}`} />
                      <span>{liveAutoListen ? 'Auto-Listen ON' : 'Enable Auto-Listen'}</span>
                    </button>
                  </div>
                </div>
              )}

              {scannerMode === 'webusb' && (
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handlePairUsb}
                      className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-[#111114] px-3 py-1.5 text-[11px] font-medium text-zinc-200 hover:border-red-500 hover:text-white"
                    >
                      <Usb className="h-3.5 w-3.5 text-red-400" />
                      <span>
                        {pairedUsbReader ? `Re-Pair USB (${pairedUsbReader.displayName})` : 'Pair USB Optical Reader'}
                      </span>
                    </button>
                    <span className="font-mono text-[11px] text-zinc-400">
                      {pairedUsbReader ? `SN: ${pairedUsbReader.serialNumber}` : 'No USB device paired'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Direct Chromium WebUSB bulk/interrupt read for ZKTeco, SecuGen, DigitalPersona, Suprema, and Futronic sensors.
                  </p>
                </div>
              )}

              {scannerMode === 'webauthn' && (
                <div className="space-y-1.5 pt-1 text-[11px]">
                  <p className={platformBioReady ? 'font-medium text-emerald-400' : 'text-amber-400'}>
                    {platformBioReady
                      ? 'Hardware Platform Biometric Sensor Ready (Windows Hello / Touch ID / FIDO2 USB Key)'
                      : 'WebAuthn FIDO2 Security Key / Platform Biometric prompt ready on supported devices.'}
                  </p>
                  <p className="text-zinc-500">
                    Verifies real cryptographic FIDO2 user-verifying biometric credentials enrolled on member profiles.
                  </p>
                </div>
              )}
            </div>

            {lastHardwareError && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
                {lastHardwareError}
              </div>
            )}

            <button
              type="button"
              disabled={scanBusy}
              onClick={() => handleTriggerScan()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-60"
            >
              <Fingerprint className="h-4 w-4" />
              <span>
                {scanBusy
                  ? 'Waiting for Physical Finger Scan...'
                  : scannerMode === 'local_bridge'
                    ? 'Capture Live Print & Verify Check-In'
                    : scannerMode === 'webusb'
                      ? 'Read USB Sensor Frame & Verify'
                      : 'Verify with Hardware Biometric Sensor'}
              </span>
            </button>

            <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/70 p-3 text-[11px] text-zinc-400 space-y-1">
              <p className="font-semibold text-zinc-200">Real-Time Hardware Listener</p>
              <p>
                Supports direct WebSocket/HTTP local SDK bridges (<span className="font-mono text-zinc-300">127.0.0.1:8181</span> or SecuGen <span className="font-mono text-zinc-300">:8443/SGIFPCapture</span>), WebUSB optical readers, WebAuthn sensors, and authenticated daemon pushes to <span className="font-mono text-zinc-300">/api/reception/biometric/hardware-push</span>.
              </p>
            </div>
          </div>

          {/* Right: Verification Result & Live Fee Cross-Reference */}
          <div className="space-y-6 lg:col-span-7">
            {verifyResult ? (
              <div className="rounded-xl border border-zinc-800 bg-[#111114] p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
                      <span>{verifyResult.member.memberCode}</span>
                      <span aria-hidden="true">·</span>
                      <span>{verifyResult.biometric.fingerLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-400">
                        {verifyResult.attendanceEntry.matchConfidence}% match
                      </span>
                    </div>
                    <h3 className="mt-1 font-display text-3xl font-bold text-white">
                      {verifyResult.member.name}
                    </h3>
                    <p className="text-xs text-zinc-400">
                      {verifyResult.member.membershipTier} · {verifyResult.member.phone} · CNIC
                      ••••{verifyResult.member.cnicLast4 || '0000'}
                    </p>
                  </div>

                  <div className="text-right">
                    <FeeStatusText status={verifyResult.member.feeStatus} />
                    <p className="mt-1 font-mono text-xs text-zinc-500 tabular-nums">
                      Paid through: {verifyResult.member.feePaidThrough}
                    </p>
                  </div>
                </div>

                {/* Fee Cross-Reference Alert Box */}
                <div
                  className={`rounded-xl border p-4 ${
                    verifyResult.alertLevel === 'clear'
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : verifyResult.alertLevel === 'pending_review'
                        ? 'border-amber-500/40 bg-amber-500/5'
                        : 'border-red-500/40 bg-red-500/5'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {verifyResult.alertLevel === 'clear' ? (
                        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                      ) : verifyResult.alertLevel === 'pending_review' ? (
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                      ) : (
                        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                      )}
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {verifyResult.attendanceEntry.accessOutcome}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-300">{verifyResult.alertMessage}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {verifyResult.pendingPayments.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setInspectingPayment(verifyResult.pendingPayments[0]);
                            setAdminRemark('');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Inspect &amp; Approve Receipt</span>
                        </button>
                      )}
                      {verifyResult.member.feeStatus !== 'Paid' && (
                        <button
                          type="button"
                          onClick={() => {
                            setResolveMember(verifyResult.member);
                            setResolveMethod('Cash');
                            setResolveRef('');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          <span>Resolve / Collect Fee</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Member Recent Check-in History */}
                <div>
                  <h4 className="text-xs font-semibold tracking-wide text-zinc-400">
                    RECENT ATTENDANCE FOR {verifyResult.member.memberCode}
                  </h4>
                  <div className="mt-2 divide-y divide-zinc-800/80 rounded-lg border border-zinc-800 bg-zinc-950">
                    {verifyResult.recentLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
                      >
                        <div>
                          <span className="font-medium text-white">{log.zoneOrClass}</span>
                          <span className="ml-2 text-zinc-500">
                            {log.deviceName || log.verifiedBy}
                          </span>
                        </div>
                        <span className="font-mono text-zinc-400 tabular-nums">
                          {formatDateTime(log.checkInTime)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-[#111114] p-10 text-center">
                <Fingerprint className="h-10 w-10 text-zinc-600" />
                <h3 className="mt-3 font-display text-2xl font-bold text-white">
                  Awaiting Live Hardware Scan
                </h3>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-400">
                  Place the member&apos;s finger on the connected optical scanner (Local SDK Bridge,
                  WebUSB reader, or WebAuthn biometric sensor). FitBase verifies the live template,
                  logs real-time attendance, and immediately cross-references monthly dues.
                </p>
              </div>
            )}

            {/* Live Pending Dues Alert Strip */}
            {dueAlerts.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-[#111114] p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-bold text-white">
                    Active Reception Fee Alerts ({dueAlerts.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => onChangeView('dues')}
                    className="text-xs font-medium text-red-400 hover:text-red-300"
                  >
                    Open Dues Queue
                  </button>
                </div>
                <div className="mt-3 divide-y divide-zinc-800/70">
                  {dueAlerts.slice(0, 4).map((m) => (
                    <div
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-white">{m.name}</span>
                        <span className="ml-2 font-mono text-zinc-500">{m.memberCode}</span>
                        <span className="ml-2 text-zinc-400">
                          · {formatPkr(m.monthlyFeePkr)} · Last paid {m.feePaidThrough}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FeeStatusText status={m.feeStatus} />
                        <button
                          type="button"
                          onClick={() => {
                            setResolveMember(m);
                            setResolveMethod('Cash');
                            setResolveRef('');
                          }}
                          className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white hover:border-emerald-500"
                        >
                          Collect / Clear
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: PENDING DUES & DISCREPANCY RESOLUTION */}
      {activeView === 'dues' && data && (
        <div className="space-y-6">
          {/* Pending & Overdue Member Dues */}
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
            <div className="border-b border-zinc-800 px-6 py-4">
              <h2 className="font-display text-xl font-bold text-white">
                Pending Dues &amp; Quick Resolution
              </h2>
              <p className="text-xs text-zinc-400">
                Members with overdue balances or uploaded payment receipts requiring front-desk
                clearance
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                  <tr>
                    <th className="px-5 py-3">Member</th>
                    <th className="px-5 py-3">Plan &amp; Monthly Due</th>
                    <th className="px-5 py-3">Last Paid</th>
                    <th className="px-5 py-3">Current Status</th>
                    <th className="px-5 py-3 text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {dueAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-sm text-emerald-400">
                        All active members are Paid for the current billing cycle.
                      </td>
                    </tr>
                  ) : (
                    dueAlerts.map((m) => {
                      const pendingSlip = data.payments.find(
                        (p) => p.memberId === m.id && p.status === 'Pending'
                      );
                      return (
                        <tr key={m.id} className="hover:bg-zinc-900/40">
                          <td className="px-5 py-3.5">
                            <p className="font-semibold text-white">
                              {m.name}{' '}
                              <span className="font-mono text-xs text-zinc-500">
                                ({m.memberCode})
                              </span>
                            </p>
                            <p className="text-xs text-zinc-400">{m.phone}</p>
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="text-xs text-zinc-200">{m.membershipTier}</p>
                            <p className="font-mono text-xs font-semibold text-yellow-400 tabular-nums">
                              {formatPkr(m.monthlyFeePkr)}
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
                              {pendingSlip && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInspectingPayment(pendingSlip);
                                    setAdminRemark('');
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  <span>Verify {pendingSlip.method}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setResolveMember(m);
                                  setResolveMethod('Cash');
                                  setResolveRef('');
                                }}
                                className="rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30"
                              >
                                Record Payment
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pending & Rejected Payment Discrepancies */}
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
            <div className="border-b border-zinc-800 px-6 py-4">
              <h3 className="font-display text-lg font-bold text-white">
                Uploaded Receipt Queue &amp; Discrepancies
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[740px] text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                  <tr>
                    <th className="px-5 py-3">Member</th>
                    <th className="px-5 py-3">Channel &amp; Reference</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Remark</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {data.payments
                    .filter((p) => p.status === 'Pending' || p.status === 'Rejected')
                    .concat(rejectedPayments.length === 0 ? [] : [])
                    .slice(0, 12)
                    .map((p) => (
                      <tr key={p.id} className="hover:bg-zinc-900/40">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-white">{p.memberName}</p>
                          <p className="font-mono text-xs text-zinc-500">{p.memberCode}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-xs font-semibold text-zinc-200">{p.method}</p>
                          <p className="font-mono text-xs text-zinc-400">{p.transactionRef}</p>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-xs font-semibold text-white tabular-nums">
                          {formatPkr(p.amountPkr)}
                        </td>
                        <td className="px-5 py-3.5">
                          <PaymentStatusText status={p.status} />
                        </td>
                        <td className="px-5 py-3.5 text-xs text-zinc-400 max-w-xs truncate">
                          {p.adminRemark || p.notes || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectingPayment(p);
                              setAdminRemark(p.adminRemark || '');
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:border-red-500"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Inspect</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: MEMBER PROFILES & BIOMETRIC ENROLLMENT */}
      {activeView === 'profiles' && data && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-800 bg-[#111114] p-1">
              {(['All', 'Enrolled', 'Not Enrolled', 'Suspended'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setBioFilter(st)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    bioFilter === st
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
                placeholder="Search name, code, phone..."
                className="w-full rounded-lg border border-zinc-800 bg-[#111114] py-2 pl-9 pr-3 text-xs text-white placeholder:text-zinc-500 focus:border-red-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                  <tr>
                    <th className="px-5 py-3">Member &amp; Security</th>
                    <th className="px-5 py-3">Membership</th>
                    <th className="px-5 py-3">Fee Status</th>
                    <th className="px-5 py-3">Fingerprint Link</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {filteredMembers.map((m) => {
                    const bio = data.biometrics.find((b) => b.memberId === m.id);
                    const bioStatus = bio?.enrollmentStatus || m.biometricStatus || 'Not Enrolled';
                    return (
                      <tr key={m.id} className="hover:bg-zinc-900/40">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-white">
                            {m.name}{' '}
                            <span className="font-mono text-xs text-zinc-500">
                              ({m.memberCode})
                            </span>
                          </p>
                          <p className="text-xs text-zinc-400">
                            {m.phone} · CNIC ••••{m.cnicLast4 || '0000'}
                          </p>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-xs font-medium text-zinc-200">
                            {m.membershipTier} · {formatPkr(m.monthlyFeePkr)}
                          </p>
                          {m.discountPkr && m.discountPkr > 0 ? (
                            <p className="text-[11px] text-emerald-400">
                              Discount -{formatPkr(m.discountPkr)}
                              {m.discountReason ? ` · ${m.discountReason}` : ''}
                            </p>
                          ) : (
                            <p className="text-xs text-zinc-500">
                              {m.membershipActive === false ? 'Frozen / Inactive' : 'Active Account'}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <FeeStatusText status={m.feeStatus} />
                          <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
                            Ends {formatShortDate(m.subscriptionEndDate)}
                          </p>
                        </td>
                        <td className="px-5 py-3.5">
                          {bioStatus === 'Enrolled' && bio ? (
                            <div className="text-xs">
                              <span className="font-semibold text-emerald-400">
                                Enrolled ({bio.fingerLabel})
                              </span>
                              <p className="font-mono text-[11px] text-zinc-500">
                                {bio.sensorVendor} · Q{bio.qualityScore}
                              </p>
                            </div>
                          ) : bioStatus === 'Suspended' ? (
                            <span className="text-xs font-semibold text-red-400">
                              Suspended Template
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-500">Not Enrolled</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditMemberModal(m)}
                              className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:border-zinc-500"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Profile</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openResetModalForMember(m)}
                              className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              <span>Reset Pass</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEnrollModal(m)}
                              className="inline-flex items-center gap-1 rounded bg-red-600/20 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-600/30"
                            >
                              <Fingerprint className="h-3.5 w-3.5" />
                              <span>{bio ? 'Re-enroll' : 'Enroll Print'}</span>
                            </button>
                            {bio && (
                              <button
                                type="button"
                                onClick={() => handleToggleBioStatus(m, bio)}
                                className="inline-flex items-center gap-1 rounded border border-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:text-white"
                              >
                                <Lock className="h-3 w-3" />
                                <span>
                                  {bio.enrollmentStatus === 'Suspended' ? 'Activate' : 'Suspend'}
                                </span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: REAL-TIME ATTENDANCE LEDGER */}
      {activeView === 'attendance' && data && (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
          <div className="border-b border-zinc-800 px-6 py-4">
            <h2 className="font-display text-xl font-bold text-white">
              Real-Time Biometric &amp; Front-Desk Attendance Ledger
            </h2>
            <p className="text-xs text-zinc-400">
              Every entry cross-references hardware identity verification against monthly fee status
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                <tr>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3">Member</th>
                  <th className="px-5 py-3">Verification Source &amp; Device</th>
                  <th className="px-5 py-3">Zone</th>
                  <th className="px-5 py-3">Fee Status at Entry</th>
                  <th className="px-5 py-3 text-right">Access Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {data.attendance.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-900/40">
                    <td className="px-5 py-3.5 font-mono text-xs text-zinc-300 tabular-nums">
                      {formatDateTime(log.checkInTime)}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-white">{log.memberName}</p>
                      <p className="font-mono text-xs text-zinc-500">{log.memberCode}</p>
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      <p className="font-medium text-zinc-200">
                        {log.verificationSource || 'Front Desk Manual'}
                      </p>
                      <p className="font-mono text-[11px] text-zinc-500">
                        {log.deviceName || log.verifiedBy}
                        {log.matchConfidence ? ` · ${log.matchConfidence}%` : ''}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-zinc-300">{log.zoneOrClass}</td>
                    <td className="px-5 py-3.5">
                      {log.feeStatusAtCheckIn ? (
                        <FeeStatusText status={log.feeStatusAtCheckIn} />
                      ) : (
                        <span className="text-xs text-zinc-500">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs font-semibold">
                      <span
                        className={
                          log.accessOutcome === 'Hold - Overdue'
                            ? 'text-red-400'
                            : log.accessOutcome === 'Granted with Due Alert'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                        }
                      >
                        {log.accessOutcome || 'Granted'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 5: AUTOMATED SUBSCRIPTION EXPIRATION & WHATSAPP RENEWAL ENGINE */}
      {activeView === 'notifications' && data && (
        <div className="space-y-6">
          {/* Daily Cron & API Dispatch Controls */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <form
              onSubmit={handleSaveNotificationSettings}
              className="rounded-xl border border-zinc-800 bg-[#111114] p-6 space-y-4 lg:col-span-7"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-white">
                    Daily Renewal Cron &amp; WhatsApp API Schedule
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Automatically cross-references member subscription end dates daily and
                    dispatches WhatsApp &amp; Member Portal alerts.
                  </p>
                </div>
                <Bell className="h-5 w-5 shrink-0 text-yellow-400" />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-zinc-400">Daily Cron Time</label>
                  <input
                    type="time"
                    value={cronTime}
                    onChange={(e) => setCronTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400">Alert Window (Days Before)</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={reminderDays}
                    onChange={(e) => setReminderDays(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <button
                    type="button"
                    onClick={() => setWhatsappEnabled((v) => !v)}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                      whatsappEnabled
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                    }`}
                  >
                    WhatsApp API: {whatsappEnabled ? 'Enabled' : 'Portal Only'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
                <p className="font-mono text-[11px] text-zinc-500">
                  Last sweep:{' '}
                  {data.notificationSettings.lastSweepAt
                    ? formatDateTime(data.notificationSettings.lastSweepAt)
                    : 'Not run yet'}{' '}
                  · {data.notificationSettings.lastSweepMatchedCount} matched
                </p>
                <button
                  type="submit"
                  disabled={settingsBusy}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:border-zinc-500"
                >
                  {settingsBusy ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>
            </form>

            <div className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-[#111114] p-6 lg:col-span-5">
              <div>
                <p className="text-xs font-semibold text-yellow-400">DAILY AUTOMATION RUNNER</p>
                <h3 className="mt-1 font-display text-xl font-bold text-white">
                  {expiringMembers.length} Accounts Within {reminderDays}-Day Renewal Window
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                  Trigger an immediate sweep to dispatch WhatsApp reminders (via Meta Cloud API /
                  Webhook if configured, or WhatsApp Dispatch Queue + wa.me) and push on-screen
                  alerts inside the Member Portal.
                </p>
              </div>

              <button
                type="button"
                disabled={sweepBusy}
                onClick={handleRunDailySweep}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-3 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${sweepBusy ? 'animate-spin' : ''}`} />
                <span>{sweepBusy ? 'Running Daily Sweep...' : 'Run Daily Sweep & Dispatch Now'}</span>
              </button>
            </div>
          </div>

          {/* Upcoming Expirations & Quick WhatsApp Send */}
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
            <div className="border-b border-zinc-800 px-6 py-4">
              <h3 className="font-display text-lg font-bold text-white">
                Members Nearing Expiration or Expired
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                  <tr>
                    <th className="px-5 py-3">Member</th>
                    <th className="px-5 py-3">Plan &amp; Net Fee</th>
                    <th className="px-5 py-3">End Date</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">WhatsApp Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {expiringMembers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-xs text-zinc-500">
                        No active members are currently within the expiration alert window.
                      </td>
                    </tr>
                  ) : (
                    expiringMembers.map(({ member, daysRemaining }) => (
                      <tr key={member.id} className="hover:bg-zinc-900/40">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-white">
                            {member.name}{' '}
                            <span className="font-mono text-xs text-zinc-500">
                              ({member.memberCode})
                            </span>
                          </p>
                          <p className="font-mono text-xs text-zinc-400">{member.phone}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-xs text-zinc-200">{member.membershipTier}</p>
                          <p className="font-mono text-xs text-yellow-400 tabular-nums">
                            {formatPkr(member.monthlyFeePkr)}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-zinc-300 tabular-nums">
                          {formatShortDate(member.subscriptionEndDate)}
                        </td>
                        <td className="px-5 py-3.5 text-xs font-semibold">
                          {daysRemaining < 0 ? (
                            <span className="text-red-400">
                              Expired {Math.abs(daysRemaining)}d ago
                            </span>
                          ) : daysRemaining === 0 ? (
                            <span className="text-amber-400">Expires Today</span>
                          ) : (
                            <span className="text-amber-300">{daysRemaining}d remaining</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            disabled={sendingMemberId === member.id}
                            onClick={() => handleSendWhatsAppReminder(member)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30"
                          >
                            <Send className="h-3.5 w-3.5" />
                            <span>
                              {sendingMemberId === member.id ? 'Sending...' : 'Send WhatsApp'}
                            </span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* WhatsApp & Portal Dispatch Audit Log */}
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
            <div className="border-b border-zinc-800 px-6 py-4">
              <h3 className="font-display text-lg font-bold text-white">
                WhatsApp &amp; Portal Reminder Dispatch Log
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                  <tr>
                    <th className="px-5 py-3">Timestamp</th>
                    <th className="px-5 py-3">Member</th>
                    <th className="px-5 py-3">Trigger &amp; Provider</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Message Preview</th>
                    <th className="px-5 py-3 text-right">Direct</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {data.notificationLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-xs text-zinc-500">
                        No reminders dispatched yet.
                      </td>
                    </tr>
                  ) : (
                    data.notificationLogs.slice(0, 20).map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-900/40">
                        <td className="px-5 py-3.5 font-mono text-xs text-zinc-400 tabular-nums">
                          {formatDateTime(log.dispatchedAt)}
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-white">{log.memberName}</p>
                          <p className="font-mono text-xs text-zinc-500">{log.phone}</p>
                        </td>
                        <td className="px-5 py-3.5 text-xs">
                          <p className="text-zinc-200">{log.provider}</p>
                          <p className="text-zinc-500">{log.triggerType}</p>
                        </td>
                        <td className="px-5 py-3.5 text-xs font-semibold">
                          <span
                            className={
                              log.deliveryStatus === 'Delivered'
                                ? 'text-emerald-400'
                                : log.deliveryStatus === 'Failed'
                                  ? 'text-red-400'
                                  : 'text-amber-400'
                            }
                          >
                            {log.deliveryStatus}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-zinc-400 max-w-md truncate">
                          {log.messagePreview}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {log.whatsappDeepLink ? (
                            <a
                              href={log.whatsappDeepLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:border-emerald-500 hover:text-emerald-300"
                            >
                              <span>wa.me</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-zinc-600">—</span>
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

      {/* VIEW 6: MEMBER PASSWORD RESETS & STAFF-INITIATED RECOVERY */}
      {activeView === 'resets' && data && (
        <div className="space-y-6">
          {issuedTempCredential && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Temporary Password Active
                  </p>
                  <h3 className="font-display text-xl font-bold text-white">
                    {issuedTempCredential.memberName}{' '}
                    <span className="font-mono text-sm text-zinc-400">
                      ({issuedTempCredential.memberCode})
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-300">
                    Login Email: <span className="font-mono text-white">{issuedTempCredential.email}</span>
                  </p>
                  <div className="mt-2 inline-flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-zinc-950 px-3.5 py-2">
                    <span className="text-xs text-zinc-400">Temporary Password:</span>
                    <span className="font-mono text-base font-bold text-yellow-400">
                      {issuedTempCredential.temporaryPassword}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyTempPassword(issuedTempCredential.temporaryPassword)}
                      className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-white hover:border-zinc-500"
                    >
                      <Copy className="h-3 w-3" />
                      <span>{copiedTempPass ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {issuedTempCredential.whatsappDeepLink && (
                    <a
                      href={issuedTempCredential.whatsappDeepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-4 py-2 text-xs font-bold text-zinc-950 hover:brightness-105"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>Send via WhatsApp</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setIssuedTempCredential(null)}
                    className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:text-white"
                  >
                    Hide
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Queue 1: Pending Member Forgot-Password Requests */}
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-6 py-4">
              <div>
                <h2 className="font-display text-xl font-bold text-white">
                  Pending Member Forgot-Password Requests ({pendingResetRequests.length})
                </h2>
                <p className="text-xs text-zinc-400">
                  Triggered from the Member Portal login screen. Verify phone number and issue a
                  temporary password.
                </p>
              </div>
              <KeyRound className="h-5 w-5 text-amber-400" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                  <tr>
                    <th className="px-5 py-3">Member &amp; Email</th>
                    <th className="px-5 py-3">Phone Verification</th>
                    <th className="px-5 py-3">Member Note</th>
                    <th className="px-5 py-3">Requested</th>
                    <th className="px-5 py-3 text-right">Reception Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {pendingResetRequests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-xs text-zinc-500">
                        No pending forgot-password requests from members right now.
                      </td>
                    </tr>
                  ) : (
                    pendingResetRequests.map((reqItem) => (
                      <tr key={reqItem.id} className="hover:bg-zinc-900/40">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-white">
                            {reqItem.memberName}{' '}
                            <span className="font-mono text-xs text-zinc-500">
                              ({reqItem.memberCode})
                            </span>
                          </p>
                          <p className="font-mono text-xs text-zinc-400">{reqItem.email}</p>
                        </td>
                        <td className="px-5 py-3.5 text-xs">
                          <p className="text-zinc-200">
                            Submitted: <span className="font-mono">{reqItem.phoneProvided}</span>
                          </p>
                          <p className="text-zinc-500">
                            On File: <span className="font-mono">{reqItem.registeredPhone}</span>
                          </p>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-zinc-300 max-w-xs">
                          {reqItem.note || '—'}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-zinc-400 tabular-nums">
                          {formatDateTime(reqItem.requestedAt)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openResetModalForRequest(reqItem)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              <span>Issue Temp Password</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDismissResetRequest(reqItem)}
                              className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-red-500 hover:text-red-300"
                            >
                              Dismiss
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

          {/* Queue 2: Staff-Initiated Reset for Any Member */}
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
            <div className="flex flex-col gap-3 border-b border-zinc-800 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-white">
                  Staff-Initiated Password Reset Directory
                </h3>
                <p className="text-xs text-zinc-400">
                  Proactively reset any member&apos;s portal password directly from the Reception Desk
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type="search"
                  value={resetSearch}
                  onChange={(e) => setResetSearch(e.target.value)}
                  placeholder="Search member name, code, email..."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-3 text-xs text-white placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[740px] text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                  <tr>
                    <th className="px-5 py-3">Member</th>
                    <th className="px-5 py-3">Login Email</th>
                    <th className="px-5 py-3">Registered Phone</th>
                    <th className="px-5 py-3">Plan &amp; Dues</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {resetDirectoryMembers.map((m) => (
                    <tr key={m.id} className="hover:bg-zinc-900/40">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-white">{m.name}</p>
                        <p className="font-mono text-xs text-zinc-500">{m.memberCode}</p>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-zinc-300">{m.email}</td>
                      <td className="px-5 py-3 font-mono text-xs text-zinc-400">{m.phone}</td>
                      <td className="px-5 py-3 text-xs">
                        <span className="text-zinc-200">{m.membershipTier}</span>
                        <span className="mx-1.5 text-zinc-600">·</span>
                        <FeeStatusText status={m.feeStatus} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openResetModalForMember(m)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          <span>Initiate Reset</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit History */}
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
            <div className="border-b border-zinc-800 px-6 py-4">
              <h3 className="font-display text-lg font-bold text-white">
                Password Reset Audit History
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                  <tr>
                    <th className="px-5 py-3">Timestamp</th>
                    <th className="px-5 py-3">Member</th>
                    <th className="px-5 py-3">Trigger Source</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Staff &amp; Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {resolvedResetRequests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-xs text-zinc-500">
                        No completed or dismissed password resets logged yet.
                      </td>
                    </tr>
                  ) : (
                    resolvedResetRequests.slice(0, 20).map((item) => (
                      <tr key={item.id} className="hover:bg-zinc-900/40">
                        <td className="px-5 py-3 font-mono text-xs text-zinc-400 tabular-nums">
                          {formatDateTime(item.resolvedAt || item.requestedAt)}
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-medium text-white">{item.memberName}</p>
                          <p className="font-mono text-xs text-zinc-500">{item.memberCode}</p>
                        </td>
                        <td className="px-5 py-3 text-xs text-zinc-300">{item.triggerSource}</td>
                        <td className="px-5 py-3 text-xs font-semibold">
                          <span
                            className={
                              item.status === 'Completed' ? 'text-emerald-400' : 'text-zinc-400'
                            }
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-zinc-400">
                          {item.resolvedBy ? `${item.resolvedBy} · ` : ''}
                          {item.resolutionNote || '—'}
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

      {/* MODAL: ISSUE / INITIATE MEMBER PASSWORD RESET */}
      {(resetTargetRequest || resetTargetMember) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reset Member Password"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={handleExecutePasswordReset}
            className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#111114] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="font-display text-xl font-bold text-white">
                  {resetTargetRequest
                    ? 'Resolve Member Password Reset'
                    : 'Initiate Member Password Reset'}
                </h3>
                <p className="text-xs text-zinc-400">
                  {resetTargetRequest?.memberName || resetTargetMember?.name} (
                  {resetTargetRequest?.memberCode || resetTargetMember?.memberCode}) ·{' '}
                  {resetTargetRequest?.email || resetTargetMember?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetTargetRequest(null);
                  setResetTargetMember(null);
                }}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {resetTargetRequest && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs space-y-1">
                <p className="text-zinc-400">
                  Submitted Phone:{' '}
                  <span className="font-mono text-white">{resetTargetRequest.phoneProvided}</span>
                </p>
                <p className="text-zinc-400">
                  Registered Phone:{' '}
                  <span className="font-mono text-emerald-400">
                    {resetTargetRequest.registeredPhone}
                  </span>
                </p>
                {resetTargetRequest.note && (
                  <p className="text-zinc-300">Note: {resetTargetRequest.note}</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs text-zinc-300">
                Custom Temporary Password (leave blank to auto-generate e.g. FB-XXXXXX)
              </label>
              <input
                type="text"
                minLength={6}
                value={resetCustomPassword}
                onChange={(e) => setResetCustomPassword(e.target.value)}
                placeholder="Auto-generate secure code if empty"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-white placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-300">Reception Remark (Optional)</label>
              <input
                type="text"
                value={resetNoteInput}
                onChange={(e) => setResetNoteInput(e.target.value)}
                placeholder="Verified ID at front desk / sent via WhatsApp"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setResetTargetRequest(null);
                  setResetTargetMember(null);
                }}
                className="flex-1 rounded-lg border border-zinc-700 py-2.5 text-xs font-medium text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetBusy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-60"
              >
                <KeyRound className="h-4 w-4" />
                <span>{resetBusy ? 'Resetting...' : 'Reset & Generate Password'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: INSPECT & APPROVE/REJECT PAYMENT RECEIPT */}
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
                  Verify Uploaded Payment Receipt
                </h3>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {inspectingPayment.memberName} ({inspectingPayment.memberCode}) ·{' '}
                  {inspectingPayment.membershipTier} · {inspectingPayment.billingMonth}
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
              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 md:col-span-7">
                {inspectingPayment.receiptUrl ? (
                  <img
                    src={inspectingPayment.receiptUrl}
                    alt={`Receipt ${inspectingPayment.transactionRef}`}
                    className="h-64 w-full object-contain"
                  />
                ) : (
                  <div className="flex h-64 items-center justify-center p-6 text-center text-xs text-zinc-500">
                    Cash desk receipt (no image attached).
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-between space-y-4 text-xs md:col-span-5">
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
                    <span className="text-zinc-500">Amount</span>
                    <p className="font-mono text-base font-bold text-white tabular-nums">
                      {formatPkr(inspectingPayment.amountPkr)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-zinc-400">Desk Verification Remark</label>
                    <input
                      type="text"
                      value={adminRemark}
                      onChange={(e) => setAdminRemark(e.target.value)}
                      placeholder="TID matched at reception desk"
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
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

      {/* MODAL: RESOLVE PENDING DUE AT RECEPTION DESK */}
      {resolveMember && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={handleResolveMemberDue}
            className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#111114] p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="font-display text-2xl font-bold text-white">
                  Resolve Monthly Fee Due
                </h3>
                <p className="text-xs text-zinc-400">
                  {resolveMember.name} ({resolveMember.memberCode}) ·{' '}
                  {formatPkr(resolveMember.monthlyFeePkr)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResolveMember(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs text-zinc-300">Payment Channel Received</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {(['Cash', 'JazzCash', 'EasyPaisa', 'Bank Transfer'] as PaymentMethod[]).map(
                  (method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setResolveMethod(method)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                        resolveMethod === method
                          ? 'border-emerald-500 bg-emerald-600/15 text-white'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                      }`}
                    >
                      {method}
                    </button>
                  )
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-300">
                Receipt / Transaction Reference (Optional for Cash)
              </label>
              <input
                type="text"
                value={resolveRef}
                onChange={(e) => setResolveRef(e.target.value)}
                placeholder="e.g. CASH-DESK-1188 or JC-994021"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResolveMember(null)}
                className="flex-1 rounded-lg border border-zinc-700 py-2.5 text-xs font-medium text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resolveBusy}
                className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                {resolveBusy ? 'Saving...' : 'Confirm Paid & Clear Due'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: CREATE / EDIT MEMBER PROFILE */}
      {(showNewMemberModal || editingMember) && data && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={editingMember ? handleUpdateMember : handleCreateMember}
            className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#111114] p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="font-display text-2xl font-bold text-white">
                  {editingMember
                    ? `Edit Profile · ${editingMember.memberCode}`
                    : 'Register New Member Profile'}
                </h3>
                <p className="text-xs text-zinc-400">
                  Sensitive identity fields are masked; biometric hash linked separately
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowNewMemberModal(false);
                  setEditingMember(null);
                }}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-zinc-400">Full Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                />
              </div>
            </div>

            {!editingMember && (
              <div>
                <label className="block text-xs text-zinc-400">Email Address</label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-zinc-400">Membership Tier</label>
                <select
                  value={formTier}
                  onChange={(e) => setFormTier(e.target.value as MembershipTier)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                >
                  <option value="Student Package">Student Package (Student ID) — PKR 6,000/mo</option>
                  <option value="Official Package">Official Package — PKR 7,000/mo</option>
                  <option value="3 Months Package">3 Months Package — PKR 16,000 total</option>
                  <option value="6 Months Package">6 Months Package (Best Value) — PKR 30,000 total</option>
                  <option value="12 Months Package">12 Months Package (Best Deal) — PKR 50,000 total</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400">Assigned Coach</label>
                <select
                  value={formTrainerId}
                  onChange={(e) => setFormTrainerId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                >
                  {data.trainers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Custom Discount & Subscription End Date */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3.5 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-zinc-400">Custom Discount (PKR)</label>
                  <input
                    type="number"
                    min="0"
                    max={TIER_RATES[formTier]}
                    step="100"
                    value={formDiscountPkr}
                    onChange={(e) => setFormDiscountPkr(e.target.value)}
                    placeholder="0"
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-[#111114] px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400">Discount Reason</label>
                  <input
                    type="text"
                    value={formDiscountReason}
                    onChange={(e) => setFormDiscountReason(e.target.value)}
                    placeholder="Student / Corporate / Promo"
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-[#111114] px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400">Subscription End Date</label>
                  <input
                    type="date"
                    required
                    value={formSubscriptionEndDate}
                    onChange={(e) => setFormSubscriptionEndDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-[#111114] px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/80 pt-2 text-xs">
                <span className="text-zinc-400">
                  Standard: <span className="font-mono">{formatPkr(TIER_RATES[formTier])}</span>
                  {parsedDiscountNum > 0
                    ? ` · Reduction: -${formatPkr(parsedDiscountNum)}`
                    : ''}
                </span>
                <span className="font-mono font-semibold text-yellow-400 tabular-nums">
                  Final Monthly Fee: {formatPkr(computedFinalFeePkr)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-zinc-400">Emergency Contact</label>
                <input
                  type="text"
                  value={formEmergency}
                  onChange={(e) => setFormEmergency(e.target.value)}
                  placeholder="+92 300 0000000 (Relation)"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400">CNIC Last 4 Digits (Masked)</label>
                <input
                  type="text"
                  maxLength={4}
                  value={formCnic4}
                  onChange={(e) => setFormCnic4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="4821"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                />
              </div>
            </div>

            {editingMember && (
              <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs">
                <span className="text-zinc-300">Membership Account Active</span>
                <button
                  type="button"
                  onClick={() => setFormActive((v) => !v)}
                  className={`rounded px-2.5 py-1 font-semibold ${
                    formActive
                      ? 'bg-emerald-600/20 text-emerald-300'
                      : 'bg-red-600/20 text-red-300'
                  }`}
                >
                  {formActive ? 'Active' : 'Frozen / Inactive'}
                </button>
              </div>
            )}

              <div>
                <label className="block text-xs text-zinc-400">Reception / Staff Notes</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Medical notes, locker preference, or billing remarks"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                />
              </div>

              {/* Live Hardware Fingerprint Enrollment During Initial Member Registration */}
              {!editingMember && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-white">
                        Enroll Fingerprint on Hardware During Registration
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        Active interface:{' '}
                        <span className="font-mono text-zinc-200">
                          {scannerMode === 'local_bridge'
                            ? 'Local SDK Bridge'
                            : scannerMode === 'webusb'
                              ? 'WebUSB Direct'
                              : 'WebAuthn Sensor'}
                        </span>
                      </p>
                    </div>
                    {regBioCapture && (
                      <button
                        type="button"
                        onClick={() => setRegBioCapture(null)}
                        className="text-[11px] font-medium text-zinc-400 hover:text-white"
                      >
                        Clear Scan
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] text-zinc-400">Scanner Vendor</label>
                      <select
                        value={regBioVendor}
                        onChange={(e) => setRegBioVendor(e.target.value as BiometricVendor)}
                        className="mt-1 w-full rounded-md border border-zinc-800 bg-[#111114] px-2.5 py-1.5 text-xs text-white focus:border-red-500 focus:outline-none"
                      >
                        {VENDORS.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400">Finger Position</label>
                      <select
                        value={regBioFinger}
                        onChange={(e) => setRegBioFinger(e.target.value as (typeof FINGERS)[number])}
                        className="mt-1 w-full rounded-md border border-zinc-800 bg-[#111114] px-2.5 py-1.5 text-xs text-white focus:border-red-500 focus:outline-none"
                      >
                        {FINGERS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {regBioCapture ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 text-emerald-300">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>
                          Live template captured ({regBioCapture.qualityScore}% quality ·{' '}
                          {regBioCapture.templateFormat}
                          {regBioCapture.hardwareSerial ? ` · ${regBioCapture.hardwareSerial}` : ''})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCaptureRegistrationPrint()}
                        className="text-[11px] font-semibold text-white underline hover:text-emerald-200"
                      >
                        Re-Scan
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={regBioBusy}
                      onClick={() => void handleCaptureRegistrationPrint()}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/50 bg-red-600/10 py-2 text-xs font-semibold text-red-200 transition-colors hover:bg-red-600/20 disabled:opacity-60"
                    >
                      <Fingerprint className="h-4 w-4" />
                      <span>
                        {regBioBusy
                          ? 'Waiting for Finger on Physical Scanner...'
                          : 'Scan Live Fingerprint Now'}
                      </span>
                    </button>
                  )}

                  {regBioError && (
                    <p className="text-[11px] text-amber-300">{regBioError}</p>
                  )}
                </div>
              )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowNewMemberModal(false);
                  setEditingMember(null);
                }}
                className="flex-1 rounded-lg border border-zinc-700 py-2.5 text-xs font-medium text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={profileBusy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2.5 text-xs font-semibold text-white hover:bg-red-500"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>
                  {profileBusy
                    ? 'Saving...'
                    : editingMember
                      ? 'Save Member Profile'
                      : regBioCapture
                        ? 'Create Profile & Enroll Print'
                        : 'Create Member Profile'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: BIOMETRIC FINGERPRINT ENROLLMENT (LIVE HARDWARE CAPTURE REQUIRED) */}
      {enrollingMember && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={handleEnrollFingerprint}
            className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#111114] p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="font-display text-2xl font-bold text-white">
                  Enroll Hardware Fingerprint
                </h3>
                <p className="text-xs text-zinc-400">
                  {enrollingMember.name} ({enrollingMember.memberCode}) · Joined{' '}
                  {formatShortDate(enrollingMember.joinDate)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnrollingMember(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs text-zinc-400">Hardware Connection Mode</label>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setScannerMode('local_bridge');
                    setEnrollCapture(null);
                    setEnrollCaptureError(null);
                  }}
                  className={`rounded-md border px-2 py-1.5 font-medium ${
                    scannerMode === 'local_bridge'
                      ? 'border-red-500 bg-red-600/15 text-white'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                  }`}
                >
                  Local SDK Bridge
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScannerMode('webusb');
                    setEnrollCapture(null);
                    setEnrollCaptureError(null);
                  }}
                  className={`rounded-md border px-2 py-1.5 font-medium ${
                    scannerMode === 'webusb'
                      ? 'border-red-500 bg-red-600/15 text-white'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                  }`}
                >
                  WebUSB Direct
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScannerMode('webauthn');
                    setEnrollVendor('WebAuthn Platform Sensor');
                    setEnrollCapture(null);
                    setEnrollCaptureError(null);
                  }}
                  className={`rounded-md border px-2 py-1.5 font-medium ${
                    scannerMode === 'webauthn'
                      ? 'border-red-500 bg-red-600/15 text-white'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                  }`}
                >
                  WebAuthn Sensor
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400">Optical Scanner Hardware</label>
              <select
                value={enrollVendor}
                onChange={(e) => setEnrollVendor(e.target.value as BiometricVendor)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
              >
                {VENDORS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-400">Finger Enrolled</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {FINGERS.map((finger) => (
                  <button
                    key={finger}
                    type="button"
                    onClick={() => setEnrollFinger(finger)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                      enrollFinger === finger
                        ? 'border-red-500 bg-red-600/15 text-white'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                    }`}
                  >
                    {finger}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Hardware Scan Step */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-zinc-200">Live Hardware Capture</span>
                {scannerMode === 'webusb' && (
                  <button
                    type="button"
                    onClick={handlePairUsb}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-red-400 hover:text-red-300"
                  >
                    <Usb className="h-3 w-3" />
                    <span>{pairedUsbReader ? 'Switch USB Reader' : 'Pair USB Reader'}</span>
                  </button>
                )}
              </div>

              {enrollCapture ? (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-emerald-300 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Print Ready for Enrollment
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCaptureEnrollPrint()}
                      className="text-[11px] underline text-white"
                    >
                      Re-Capture
                    </button>
                  </div>
                  <p className="font-mono text-[11px] text-emerald-200/90">
                    Quality: {enrollCapture.qualityScore}% · {enrollCapture.templateFormat}
                    {enrollCapture.hardwareSerial ? ` · SN ${enrollCapture.hardwareSerial}` : ''}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={enrollCaptureBusy}
                  onClick={() => void handleCaptureEnrollPrint()}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-700 bg-[#111114] py-2 font-semibold text-zinc-100 hover:border-red-500 disabled:opacity-60"
                >
                  <Fingerprint className="h-4 w-4 text-red-400" />
                  <span>
                    {enrollCaptureBusy
                      ? 'Waiting for Finger on Sensor...'
                      : 'Read Finger from Connected Hardware'}
                  </span>
                </button>
              )}

              {enrollCaptureError && (
                <p className="text-[11px] text-amber-300">{enrollCaptureError}</p>
              )}

              <p className="text-[11px] text-zinc-500">
                Captured minutiae are hashed with HMAC-SHA256 on the server. Unverified or synthetic
                payloads are rejected.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEnrollingMember(null)}
                className="flex-1 rounded-lg border border-zinc-700 py-2.5 text-xs font-medium text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={enrollBusy || enrollCaptureBusy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
              >
                <Fingerprint className="h-4 w-4" />
                <span>
                  {enrollBusy
                    ? 'Saving Print...'
                    : enrollCapture
                      ? 'Save Enrolled Print'
                      : 'Capture & Link Print'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

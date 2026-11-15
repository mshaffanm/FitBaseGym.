import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AttendanceLog,
  BiometricCaptureProtocol,
  BiometricEnrollmentStatus,
  BiometricSummary,
  BiometricTemplateFormat,
  BiometricVendor,
  FeedbackEntry,
  FeeStatus,
  GymClass,
  MemberGoal,
  MembershipTier,
  NotificationLogEntry,
  NotificationSettings,
  PasswordResetRequest,
  PaymentApprovalStatus,
  PaymentMethod,
  PaymentSubmission,
  PerformanceLog,
  TrainerPortraitKey,
  TrainerRecord,
  UserProfile,
  UserRole,
} from '../src/types.ts';
import { getSupabaseAdmin } from './supabase.ts';

export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const BIOMETRIC_SALT = process.env.BIOMETRIC_SALT || 'fitbase-biometric-hmac-v2';

export function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export const TIER_FEES: Record<MembershipTier, number> = {
  'Student Package': 6000,
  'Official Package': 7000,
  '3 Months Package': 16000,
  '6 Months Package': 30000,
  '12 Months Package': 50000,
};

export const TIER_DURATION_DAYS: Record<MembershipTier, number> = {
  'Student Package': 30,
  'Official Package': 30,
  '3 Months Package': 90,
  '6 Months Package': 180,
  '12 Months Package': 365,
};

export const SUPPORTED_BIOMETRIC_VENDORS: BiometricVendor[] = [
  'ZKTeco SLK20R',
  'SecuGen Hamster Pro 20',
  'DigitalPersona U.are.U 4500',
  'WebAuthn Platform Sensor',
];

export function addDaysIso(baseIsoDate: string, days: number): string {
  const d = new Date(`${baseIsoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() + days);
    return fallback.toISOString().slice(0, 10);
  }
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function computeDaysRemaining(subscriptionEndDate: string): number {
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = new Date(`${todayStr}T00:00:00Z`).getTime();
  const end = new Date(`${subscriptionEndDate.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(end)) return -1;
  return Math.round((end - today) / 86_400_000);
}

/**
 * Strict membership expiry enforcement for member accounts.
 * Admin and reception staff accounts are not blocked by subscription dates.
 */
export function isMembershipExpired(user: Pick<UserProfile, 'role' | 'membershipActive' | 'subscriptionEndDate'>): boolean {
  if (user.role !== 'member') return false;
  if (user.membershipActive === false) return true;
  if (!user.subscriptionEndDate) return true;
  return computeDaysRemaining(user.subscriptionEndDate) < 0;
}

export function hashBiometricSignal(rawSignal: string): string {
  return crypto
    .createHmac('sha256', BIOMETRIC_SALT)
    .update(rawSignal.trim())
    .digest('hex');
}

export function isValidHardwareBiometricSignal(
  rawSignal?: string,
  credentialId?: string
): boolean {
  const token = (rawSignal || credentialId || '').trim();
  if (token.length < 16) return false;
  if (/^FB-BIO-/i.test(token) || /^SIM-/i.test(token) || /^DEMO-/i.test(token)) {
    return false;
  }
  return true;
}

export interface StoredBiometricRow extends BiometricSummary {
  templateHash: string;
}

export function mapProfileRow(row: Record<string, unknown>): UserProfile {
  const tier = (row.membership_tier as MembershipTier) || 'Official Package';
  const baseFee =
    typeof row.base_monthly_fee_pkr === 'number'
      ? row.base_monthly_fee_pkr
      : TIER_FEES[tier] || 7000;
  const discount = typeof row.discount_pkr === 'number' ? row.discount_pkr : 0;
  const monthlyFee =
    typeof row.monthly_fee_pkr === 'number' ? row.monthly_fee_pkr : Math.max(0, baseFee - discount);

  return {
    id: String(row.id),
    memberCode: String(row.member_code || ''),
    name: String(row.name || ''),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    role: (row.role as UserRole) || 'member',
    membershipTier: tier,
    baseMonthlyFeePkr: baseFee,
    discountPkr: discount,
    discountReason: row.discount_reason ? String(row.discount_reason) : undefined,
    monthlyFeePkr: monthlyFee,
    feeStatus: (row.fee_status as FeeStatus) || 'Overdue',
    feePaidThrough: String(row.fee_paid_through || 'Unpaid'),
    subscriptionEndDate: String(row.subscription_end_date || ''),
    lastReminderSentAt: row.last_reminder_sent_at ? String(row.last_reminder_sent_at) : undefined,
    joinDate: String(row.join_date || new Date().toISOString().slice(0, 10)),
    assignedTrainerId: row.assigned_trainer_id ? String(row.assigned_trainer_id) : undefined,
    emergencyContact: row.emergency_contact ? String(row.emergency_contact) : undefined,
    cnicLast4: row.cnic_last4 ? String(row.cnic_last4) : undefined,
    membershipActive: row.membership_active !== false,
    biometricStatus: (row.biometric_status as BiometricEnrollmentStatus) || 'Not Enrolled',
    biometricFingerLabel: row.biometric_finger_label ? String(row.biometric_finger_label) : undefined,
    staffNotes: row.staff_notes ? String(row.staff_notes) : undefined,
  };
}

export function mapTrainerRow(row: Record<string, unknown>): TrainerRecord {
  const portraitKeyRaw = String(row.portrait_key || 'default');
  const validKeys: TrainerPortraitKey[] = [
    'coach_bilal',
    'coach_ayesha',
    'coach_zohaib',
    'coach_nadia',
    'default',
  ];
  const portraitKey = validKeys.includes(portraitKeyRaw as TrainerPortraitKey)
    ? (portraitKeyRaw as TrainerPortraitKey)
    : 'default';

  return {
    id: String(row.id),
    name: String(row.name || ''),
    specialty: String(row.specialty || ''),
    certifications: String(row.certifications || ''),
    experienceYears: Number(row.experience_years ?? 1),
    portraitKey,
    portraitUrl: row.portrait_url ? String(row.portrait_url) : null,
    activeClients: Number(row.active_clients ?? 0),
    sessionsThisMonth: Number(row.sessions_this_month ?? 0),
    attendanceCompletionRate: Number(row.attendance_completion_rate ?? 100),
    clientRetentionRate: Number(row.client_retention_rate ?? 100),
    rating: Number(row.rating ?? 5.0),
    bio: String(row.bio || ''),
    adminReviewNote: String(row.admin_review_note || ''),
    lastEvaluatedAt: String(row.last_evaluated_at || new Date().toISOString().slice(0, 10)),
  };
}

export function mapClassRow(row: Record<string, unknown>): GymClass {
  const bookedRaw = row.booked_member_ids;
  const bookedMemberIds = Array.isArray(bookedRaw)
    ? bookedRaw.map((id) => String(id))
    : [];

  return {
    id: String(row.id),
    title: String(row.title || ''),
    discipline: row.discipline as GymClass['discipline'],
    dayOfWeek: row.day_of_week as GymClass['dayOfWeek'],
    startTime: String(row.start_time || ''),
    durationMin: Number(row.duration_min ?? 45),
    trainerId: row.trainer_id ? String(row.trainer_id) : '',
    trainerName: String(row.trainer_name || ''),
    zone: String(row.zone || ''),
    intensity: (row.intensity as GymClass['intensity']) || 'Moderate',
    capacity: Number(row.capacity ?? 15),
    bookedMemberIds,
    audience: row.audience ? (row.audience as GymClass['audience']) : undefined,
    slotLabel: row.slot_label ? String(row.slot_label) : undefined,
  };
}

export function mapBiometricRow(row: Record<string, unknown>): StoredBiometricRow {
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    memberCode: String(row.member_code || ''),
    sensorVendor: (row.sensor_vendor as BiometricVendor) || 'ZKTeco SLK20R',
    fingerLabel: (row.finger_label as BiometricSummary['fingerLabel']) || 'Right Index',
    enrollmentStatus: (row.enrollment_status as BiometricEnrollmentStatus) || 'Enrolled',
    qualityScore: Number(row.quality_score ?? 95),
    enrolledAt: String(row.enrolled_at || ''),
    enrolledBy: String(row.enrolled_by || ''),
    lastMatchedAt: row.last_matched_at ? String(row.last_matched_at) : undefined,
    hardwareSerial: row.hardware_serial ? String(row.hardware_serial) : undefined,
    captureProtocol: row.capture_protocol
      ? (row.capture_protocol as BiometricCaptureProtocol)
      : undefined,
    templateFormat: row.template_format
      ? (row.template_format as BiometricTemplateFormat)
      : undefined,
    credentialId: row.credential_id ? String(row.credential_id) : undefined,
    templateHash: String(row.template_hash || ''),
  };
}

export function sanitizeBiometricRow(row: StoredBiometricRow): BiometricSummary {
  const { templateHash: _ignored, ...rest } = row;
  return rest;
}

export function mapPerformanceRow(row: Record<string, unknown>): PerformanceLog {
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    date: String(row.date),
    metric: String(row.metric),
    category: row.category as PerformanceLog['category'],
    value: Number(row.value),
    unit: String(row.unit),
    notes: row.notes ? String(row.notes) : '',
  };
}

export function mapGoalRow(row: Record<string, unknown>): MemberGoal {
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    title: String(row.title),
    metric: String(row.metric),
    startValue: Number(row.start_value ?? 0),
    currentValue: Number(row.current_value ?? 0),
    targetValue: Number(row.target_value ?? 0),
    unit: String(row.unit),
    deadline: String(row.deadline),
    status: (row.status as MemberGoal['status']) || 'Active',
  };
}

export function mapAttendanceRow(row: Record<string, unknown>): AttendanceLog {
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    memberName: String(row.member_name),
    memberCode: String(row.member_code),
    checkInTime: String(row.check_in_time),
    zoneOrClass: String(row.zone_or_class),
    verifiedBy: String(row.verified_by),
    verificationSource: row.verification_source
      ? (row.verification_source as AttendanceLog['verificationSource'])
      : undefined,
    deviceName: row.device_name ? String(row.device_name) : undefined,
    matchConfidence:
      row.match_confidence !== null && row.match_confidence !== undefined
        ? Number(row.match_confidence)
        : undefined,
    feeStatusAtCheckIn: row.fee_status_at_check_in
      ? (row.fee_status_at_check_in as FeeStatus)
      : undefined,
    accessOutcome: row.access_outcome
      ? (row.access_outcome as AttendanceLog['accessOutcome'])
      : undefined,
  };
}

export function mapPaymentRow(row: Record<string, unknown>): PaymentSubmission {
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    memberName: String(row.member_name),
    memberCode: String(row.member_code),
    membershipTier: (row.membership_tier as MembershipTier) || 'Official Package',
    billingMonth: String(row.billing_month),
    amountPkr: Number(row.amount_pkr),
    method: row.method as PaymentMethod,
    transactionRef: String(row.transaction_ref),
    receiptUrl: row.receipt_url ? String(row.receipt_url) : null,
    receiptFileName: row.receipt_file_name ? String(row.receipt_file_name) : null,
    notes: String(row.notes || ''),
    status: (row.status as PaymentApprovalStatus) || 'Pending',
    submittedAt: String(row.submitted_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : undefined,
    adminRemark: row.admin_remark ? String(row.admin_remark) : undefined,
  };
}

export function mapFeedbackRow(row: Record<string, unknown>): FeedbackEntry {
  return {
    id: String(row.id),
    memberId: row.member_id ? String(row.member_id) : null,
    authorName: String(row.author_name),
    authorEmail: String(row.author_email),
    category: row.category as FeedbackEntry['category'],
    trainerId: row.trainer_id ? String(row.trainer_id) : undefined,
    rating: Number(row.rating ?? 5),
    message: String(row.message),
    status: (row.status as FeedbackEntry['status']) || 'Open',
    adminReply: row.admin_reply ? String(row.admin_reply) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapNotificationLogRow(row: Record<string, unknown>): NotificationLogEntry {
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    memberName: String(row.member_name),
    memberCode: String(row.member_code),
    phone: String(row.phone),
    channel: (row.channel as NotificationLogEntry['channel']) || 'WhatsApp',
    provider: row.provider as NotificationLogEntry['provider'],
    daysRemaining: Number(row.days_remaining ?? 0),
    subscriptionEndDate: String(row.subscription_end_date),
    messagePreview: String(row.message_preview),
    deliveryStatus: row.delivery_status as NotificationLogEntry['deliveryStatus'],
    providerMessageId: row.provider_message_id ? String(row.provider_message_id) : undefined,
    whatsappDeepLink: row.whatsapp_deep_link ? String(row.whatsapp_deep_link) : undefined,
    dispatchedAt: String(row.dispatched_at),
    triggerType: (row.trigger_type as NotificationLogEntry['triggerType']) || 'Daily Cron',
  };
}

export function mapNotificationSettingsRow(row: Record<string, unknown> | null): NotificationSettings {
  if (!row) {
    return {
      reminderDaysBefore: 5,
      dailyCronTime: '08:00',
      whatsappEnabled: true,
      lastSweepAt: null,
      lastSweepMatchedCount: 0,
    };
  }
  return {
    reminderDaysBefore: Number(row.reminder_days_before ?? 5),
    dailyCronTime: String(row.daily_cron_time || '08:00'),
    whatsappEnabled: row.whatsapp_enabled !== false,
    lastSweepAt: row.last_sweep_at ? String(row.last_sweep_at) : null,
    lastSweepMatchedCount: Number(row.last_sweep_matched_count ?? 0),
  };
}

export function mapPasswordResetRow(row: Record<string, unknown>): PasswordResetRequest {
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    memberCode: String(row.member_code),
    memberName: String(row.member_name),
    email: String(row.email),
    phoneProvided: String(row.phone_provided),
    registeredPhone: String(row.registered_phone),
    note: row.note ? String(row.note) : undefined,
    status: (row.status as PasswordResetRequest['status']) || 'Pending',
    triggerSource:
      (row.trigger_source as PasswordResetRequest['triggerSource']) || 'Member Forgot Password',
    requestedAt: String(row.requested_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    resolvedBy: row.resolved_by ? String(row.resolved_by) : undefined,
    resolutionNote: row.resolution_note ? String(row.resolution_note) : undefined,
  };
}

export async function getTrainers(): Promise<TrainerRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('trainers')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => mapTrainerRow(r as Record<string, unknown>));
}

export async function getGymClasses(): Promise<GymClass[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('gym_classes').select('*');
  if (error) throw new Error(error.message);
  return (data || []).map((r) => mapClassRow(r as Record<string, unknown>));
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapNotificationSettingsRow((data as Record<string, unknown> | null) ?? null);
}

export async function getProfileById(id: string): Promise<UserProfile | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapProfileRow(data as Record<string, unknown>) : null;
}

export async function getMemberProfiles(): Promise<UserProfile[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'member')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => mapProfileRow(r as Record<string, unknown>));
}

export type UserRole = 'member' | 'reception' | 'admin';

export type PortalTarget = 'member' | 'reception' | 'admin';

export interface PasswordResetRequest {
  id: string;
  memberId: string;
  memberCode: string;
  memberName: string;
  email: string;
  phoneProvided: string;
  registeredPhone: string;
  note?: string;
  status: 'Pending' | 'Completed' | 'Dismissed';
  triggerSource: 'Member Forgot Password' | 'Reception Initiated';
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
}

export type MembershipTier =
  | 'Student Package'
  | 'Official Package'
  | '3 Months Package'
  | '6 Months Package'
  | '12 Months Package';

export type FeeStatus = 'Paid' | 'Pending Verification' | 'Overdue';

export type PaymentMethod = 'JazzCash' | 'EasyPaisa' | 'Cash' | 'Bank Transfer';

export type PaymentApprovalStatus = 'Pending' | 'Approved' | 'Rejected';

export type BiometricEnrollmentStatus = 'Enrolled' | 'Not Enrolled' | 'Suspended';

export type BiometricVendor =
  | 'ZKTeco SLK20R'
  | 'SecuGen Hamster Pro 20'
  | 'DigitalPersona U.are.U 4500'
  | 'WebAuthn Platform Sensor';

export type BiometricCaptureProtocol = 'Local SDK Bridge' | 'WebUSB Direct' | 'WebAuthn Biometric';

export type BiometricTemplateFormat =
  | 'ISO-19794-2'
  | 'SG-FMR'
  | 'ZK-FPT'
  | 'WebAuthn-FIDO2'
  | 'USB-RAW-SHA256';

export interface BiometricSummary {
  id: string;
  memberId: string;
  memberCode: string;
  sensorVendor: BiometricVendor;
  fingerLabel: 'Right Index' | 'Right Thumb' | 'Left Index' | 'Left Thumb';
  enrollmentStatus: BiometricEnrollmentStatus;
  qualityScore: number;
  enrolledAt: string;
  enrolledBy: string;
  lastMatchedAt?: string;
  hardwareSerial?: string;
  captureProtocol?: BiometricCaptureProtocol;
  templateFormat?: BiometricTemplateFormat;
  credentialId?: string;
}

export interface UserProfile {
  id: string;
  memberCode: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  membershipTier: MembershipTier;
  baseMonthlyFeePkr?: number;
  discountPkr?: number;
  discountReason?: string;
  monthlyFeePkr: number;
  feeStatus: FeeStatus;
  feePaidThrough: string;
  subscriptionEndDate: string;
  lastReminderSentAt?: string;
  joinDate: string;
  assignedTrainerId?: string;
  emergencyContact?: string;
  cnicLast4?: string;
  membershipActive?: boolean;
  biometricStatus?: BiometricEnrollmentStatus;
  biometricFingerLabel?: string;
  staffNotes?: string;
}

export interface NotificationLogEntry {
  id: string;
  memberId: string;
  memberName: string;
  memberCode: string;
  phone: string;
  channel: 'WhatsApp' | 'In-Portal';
  provider: 'WhatsApp Cloud API' | 'WhatsApp Webhook' | 'WhatsApp Dispatch Queue' | 'Member Portal Alert';
  daysRemaining: number;
  subscriptionEndDate: string;
  messagePreview: string;
  deliveryStatus: 'Delivered' | 'Queued (Configure API Token)' | 'Failed';
  providerMessageId?: string;
  whatsappDeepLink?: string;
  dispatchedAt: string;
  triggerType: 'Daily Cron' | 'Manual Run';
}

export interface NotificationSettings {
  reminderDaysBefore: number;
  dailyCronTime: string;
  whatsappEnabled: boolean;
  lastSweepAt: string | null;
  lastSweepMatchedCount: number;
}

export interface ExpirationAlertSummary {
  status: 'Active' | 'Expiring Soon' | 'Expired';
  daysRemaining: number;
  subscriptionEndDate: string;
  message: string;
}

export interface GymClass {
  id: string;
  title: string;
  discipline: 'Strength' | 'Conditioning' | 'Olympic Lifting' | 'Mobility' | 'Boxing';
  dayOfWeek: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  startTime: string;
  durationMin: number;
  trainerId: string;
  trainerName: string;
  zone: string;
  intensity: 'Moderate' | 'High' | 'Max Effort';
  capacity: number;
  bookedMemberIds: string[];
  audience?: 'Co-Ed' | 'Female Only';
  slotLabel?: string;
}

export interface PerformanceLog {
  id: string;
  memberId: string;
  date: string;
  metric: string;
  category: 'Strength Lift' | 'Conditioning' | 'Body Composition';
  value: number;
  unit: string;
  notes?: string;
}

export interface MemberGoal {
  id: string;
  memberId: string;
  title: string;
  metric: string;
  startValue: number;
  currentValue: number;
  targetValue: number;
  unit: string;
  deadline: string;
  status: 'Active' | 'Achieved';
}

export interface AttendanceLog {
  id: string;
  memberId: string;
  memberName: string;
  memberCode: string;
  checkInTime: string;
  zoneOrClass: string;
  verifiedBy: string;
  verificationSource?: 'Biometric Scanner' | 'Front Desk Manual' | 'Member Self Check-In';
  deviceName?: string;
  matchConfidence?: number;
  feeStatusAtCheckIn?: FeeStatus;
  accessOutcome?: 'Granted' | 'Granted with Due Alert' | 'Hold - Overdue';
}

export interface PaymentSubmission {
  id: string;
  memberId: string;
  memberName: string;
  memberCode: string;
  membershipTier: MembershipTier;
  billingMonth: string;
  amountPkr: number;
  method: PaymentMethod;
  transactionRef: string;
  receiptUrl: string | null;
  receiptFileName: string | null;
  notes: string;
  status: PaymentApprovalStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  adminRemark?: string;
}

export type TrainerPortraitKey =
  | 'coach_bilal'
  | 'coach_ayesha'
  | 'coach_zohaib'
  | 'coach_nadia'
  | 'default';

export interface TrainerRecord {
  id: string;
  name: string;
  specialty: string;
  certifications: string;
  experienceYears: number;
  portraitKey: TrainerPortraitKey;
  portraitUrl?: string | null;
  activeClients: number;
  sessionsThisMonth: number;
  attendanceCompletionRate: number;
  clientRetentionRate: number;
  rating: number;
  bio: string;
  adminReviewNote: string;
  lastEvaluatedAt: string;
}

export interface TrainerInput {
  name: string;
  specialty: string;
  certifications?: string;
  experienceYears?: number;
  portraitKey?: TrainerPortraitKey;
  portraitUrl?: string | null;
  activeClients?: number;
  sessionsThisMonth?: number;
  attendanceCompletionRate?: number;
  clientRetentionRate?: number;
  rating?: number;
  bio?: string;
  adminReviewNote?: string;
}

export interface FeedbackEntry {
  id: string;
  memberId: string | null;
  authorName: string;
  authorEmail: string;
  category: 'Equipment' | 'Trainer' | 'Facility' | 'Billing' | 'General Inquiry';
  trainerId?: string;
  rating: number;
  message: string;
  status: 'Open' | 'In Review' | 'Resolved';
  adminReply?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BiometricVerifyResult {
  matched: boolean;
  member: UserProfile;
  biometric: BiometricSummary;
  attendanceEntry: AttendanceLog;
  pendingPayments: PaymentSubmission[];
  recentLogs: AttendanceLog[];
  alertLevel: 'clear' | 'pending_review' | 'overdue';
  alertMessage: string;
}

export interface ReceptionOverviewPayload {
  metrics: {
    todayCheckIns: number;
    biometricCheckInsToday: number;
    enrolledMembers: number;
    totalMembers: number;
    overdueCount: number;
    pendingVerificationCount: number;
    totalPendingDuesPkr: number;
    expiringSoonCount: number;
    pendingPasswordResets: number;
  };
  members: UserProfile[];
  biometrics: BiometricSummary[];
  payments: PaymentSubmission[];
  attendance: AttendanceLog[];
  trainers: TrainerRecord[];
  notificationLogs: NotificationLogEntry[];
  notificationSettings: NotificationSettings;
  passwordResetRequests: PasswordResetRequest[];
}

export interface AdminOverviewPayload {
  metrics: {
    totalMembers: number;
    paidMembers: number;
    pendingVerifications: number;
    overdueMembers: number;
    collectedThisMonthPkr: number;
    avgTrainerRating: number;
    openFeedbackCount: number;
    todayCheckIns: number;
    expiringSoonCount: number;
  };
  members: UserProfile[];
  payments: PaymentSubmission[];
  trainers: TrainerRecord[];
  feedback: FeedbackEntry[];
  attendance: AttendanceLog[];
  biometrics: BiometricSummary[];
  notificationLogs: NotificationLogEntry[];
  notificationSettings: NotificationSettings;
}

export interface MemberDashboardPayload {
  profile: UserProfile;
  expirationAlert: ExpirationAlertSummary;
  notifications: NotificationLogEntry[];
  performanceLogs: PerformanceLog[];
  goals: MemberGoal[];
  attendanceLogs: AttendanceLog[];
  payments: PaymentSubmission[];
  classes: GymClass[];
  feedback: FeedbackEntry[];
  trainers: TrainerRecord[];
}

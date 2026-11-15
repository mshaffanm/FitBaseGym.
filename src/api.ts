import { clearBrowserSession, syncBrowserSession } from './lib/supabase';
import type {
  AdminOverviewPayload,
  AttendanceLog,
  BiometricCaptureProtocol,
  BiometricEnrollmentStatus,
  BiometricSummary,
  BiometricTemplateFormat,
  BiometricVendor,
  BiometricVerifyResult,
  FeedbackEntry,
  GymClass,
  MemberDashboardPayload,
  MemberGoal,
  MembershipTier,
  PasswordResetRequest,
  PaymentMethod,
  PaymentSubmission,
  PerformanceLog,
  ReceptionOverviewPayload,
  TrainerInput,
  TrainerRecord,
  UserProfile,
} from './types';

const TOKEN_STORAGE_KEY = 'fitbase_auth_token';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function signOutSession() {
  setAuthToken(null);
  void clearBrowserSession();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface BiometricCaptureInput {
  sensorVendor: BiometricVendor;
  fingerLabel: 'Right Index' | 'Right Thumb' | 'Left Index' | 'Left Thumb';
  rawSignal: string;
  qualityScore?: number;
  hardwareSerial?: string;
  captureProtocol?: BiometricCaptureProtocol;
  templateFormat?: BiometricTemplateFormat;
  credentialId?: string;
}

export const api = {
  getPublicConfig: () =>
    request<{ supabaseUrl: string | null; supabaseAnonKey: string | null }>('/api/public/config'),

  getPublicOverview: () =>
    request<{ classes: GymClass[]; trainers: TrainerRecord[]; tiers: Record<MembershipTier, number> }>(
      '/api/public/overview'
    ),

  chatWithFitBase: (payload: {
    message: string;
    history?: Array<{ role: 'user' | 'model'; text: string }>;
  }) =>
    request<{ reply: string }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: async (email: string, password: string) => {
    const res = await request<{ token: string; refreshToken?: string; user: UserProfile }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    );
    void syncBrowserSession(res.token, res.refreshToken);
    return res;
  },

  register: async (payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    membershipTier: MembershipTier;
  }) => {
    const res = await request<{ token: string; refreshToken?: string; user: UserProfile }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    void syncBrowserSession(res.token, res.refreshToken);
    return res;
  },

  requestPasswordReset: (payload: { identifier: string; phone: string; note?: string }) =>
    request<{
      request: {
        id: string;
        memberCode: string;
        memberName: string;
        status: string;
        requestedAt: string;
      };
      message: string;
    }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMe: () => request<{ user: UserProfile }>('/api/auth/me'),

  getMemberDashboard: () => request<MemberDashboardPayload>('/api/member/dashboard'),

  toggleClassBooking: (classId: string) =>
    request<{ classes: GymClass[]; booked: boolean }>(`/api/member/classes/${classId}/toggle`, {
      method: 'POST',
    }),

  addPerformanceLog: (payload: {
    date: string;
    metric: string;
    category: 'Strength Lift' | 'Conditioning' | 'Body Composition';
    value: number;
    unit: string;
    notes: string;
  }) =>
    request<{ entry: PerformanceLog }>('/api/member/performance', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deletePerformanceLog: (logId: string) =>
    request<{ ok: boolean }>(`/api/member/performance/${logId}`, { method: 'DELETE' }),

  createGoal: (payload: {
    title: string;
    metric: string;
    startValue: number;
    currentValue: number;
    targetValue: number;
    unit: string;
    deadline: string;
  }) =>
    request<{ goal: MemberGoal }>('/api/member/goals', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateGoal: (goalId: string, payload: { currentValue?: number; status?: 'Active' | 'Achieved' }) =>
    request<{ goal: MemberGoal }>(`/api/member/goals/${goalId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteGoal: (goalId: string) =>
    request<{ ok: boolean }>(`/api/member/goals/${goalId}`, { method: 'DELETE' }),

  checkInMember: (zoneOrClass: string) =>
    request<{ entry: AttendanceLog }>('/api/member/attendance/checkin', {
      method: 'POST',
      body: JSON.stringify({ zoneOrClass }),
    }),

  submitPayment: (formData: FormData) =>
    request<{ payment: PaymentSubmission; profile: UserProfile }>('/api/member/payments', {
      method: 'POST',
      body: formData,
    }),

  submitMemberFeedback: (payload: {
    category: 'Equipment' | 'Trainer' | 'Facility' | 'Billing';
    trainerId?: string;
    rating: number;
    message: string;
  }) =>
    request<{ entry: FeedbackEntry }>('/api/member/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAdminOverview: () => request<AdminOverviewPayload>('/api/admin/overview'),

  getReceptionOverview: () => request<ReceptionOverviewPayload>('/api/reception/overview'),

  createMemberProfile: (payload: {
    name: string;
    email: string;
    phone: string;
    membershipTier: MembershipTier;
    discountPkr?: number;
    discountReason?: string;
    subscriptionEndDate?: string;
    assignedTrainerId?: string;
    emergencyContact?: string;
    cnicLast4?: string;
    staffNotes?: string;
    password?: string;
    biometricCapture?: BiometricCaptureInput;
  }) =>
    request<{ member: UserProfile; biometric?: BiometricSummary }>('/api/reception/members', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateMemberProfile: (
    memberId: string,
    payload: {
      name?: string;
      phone?: string;
      membershipTier?: MembershipTier;
      discountPkr?: number;
      discountReason?: string;
      subscriptionEndDate?: string;
      assignedTrainerId?: string;
      emergencyContact?: string;
      cnicLast4?: string;
      membershipActive?: boolean;
      staffNotes?: string;
    }
  ) =>
    request<{ member: UserProfile }>(`/api/reception/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  resolvePasswordReset: (
    requestId: string,
    payload: { action: 'reset' | 'dismiss'; newPassword?: string; resolutionNote?: string }
  ) =>
    request<{
      request: PasswordResetRequest;
      temporaryPassword?: string;
      whatsappDeepLink?: string;
    }>(`/api/reception/password-resets/${requestId}/resolve`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  initiateMemberPasswordReset: (
    memberId: string,
    payload: { newPassword?: string; resolutionNote?: string }
  ) =>
    request<{
      member: UserProfile;
      request: PasswordResetRequest;
      temporaryPassword: string;
      whatsappDeepLink: string;
    }>(`/api/reception/members/${memberId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  runNotificationSweep: () =>
    request<{ dispatchedCount: number; lastSweepAt: string }>('/api/staff/notifications/run-sweep', {
      method: 'POST',
    }),

  sendMemberWhatsAppReminder: (memberId: string) =>
    request<{ log: import('./types').NotificationLogEntry; whatsappDeepLink: string }>(
      `/api/staff/notifications/send/${memberId}`,
      { method: 'POST' }
    ),

  updateNotificationSettings: (payload: {
    reminderDaysBefore?: number;
    dailyCronTime?: string;
    whatsappEnabled?: boolean;
  }) =>
    request<{ settings: import('./types').NotificationSettings }>(
      '/api/staff/notifications/settings',
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    ),

  enrollBiometric: (payload: BiometricCaptureInput & { memberId: string }) =>
    request<{ biometric: BiometricSummary; member: UserProfile }>(
      '/api/reception/biometric/enroll',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  updateBiometricStatus: (memberId: string, enrollmentStatus: BiometricEnrollmentStatus) =>
    request<{ biometric: BiometricSummary; member: UserProfile }>(
      `/api/reception/biometric/${memberId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ enrollmentStatus }),
      }
    ),

  verifyBiometricCheckIn: (payload: {
    rawSignal?: string;
    credentialId?: string;
    deviceName?: string;
    hardwareSerial?: string;
    captureProtocol?: BiometricCaptureProtocol;
    zoneOrClass?: string;
    matchConfidence?: number;
  }) =>
    request<BiometricVerifyResult>('/api/reception/biometric/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  reviewPayment: (paymentId: string, action: 'approve' | 'reject', adminRemark: string) =>
    request<{ payment: PaymentSubmission }>(`/api/admin/payments/${paymentId}/review`, {
      method: 'POST',
      body: JSON.stringify({ action, adminRemark }),
    }),

  updateMemberFeeStatus: (
    memberId: string,
    payload: {
      feeStatus?: 'Paid' | 'Pending Verification' | 'Overdue';
      recordCashPayment?: boolean;
      paymentMethod?: PaymentMethod;
      transactionRef?: string;
    }
  ) =>
    request<{ member: UserProfile }>(`/api/admin/members/${memberId}/fee-status`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adminCheckInMember: (memberId: string) =>
    request<{ entry: AttendanceLog }>(`/api/admin/members/${memberId}/checkin`, {
      method: 'POST',
    }),

  createTrainer: (payload: TrainerInput) =>
    request<{ trainer: TrainerRecord }>('/api/admin/trainers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateTrainer: (trainerId: string, payload: Partial<TrainerInput>) =>
    request<{ trainer: TrainerRecord }>(`/api/admin/trainers/${trainerId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteTrainer: (trainerId: string) =>
    request<{ ok: boolean }>(`/api/admin/trainers/${trainerId}`, {
      method: 'DELETE',
    }),

  updateFeedbackStatus: (
    feedbackId: string,
    payload: { status: 'Open' | 'In Review' | 'Resolved'; adminReply: string }
  ) =>
    request<{ entry: FeedbackEntry }>(`/api/admin/feedback/${feedbackId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};

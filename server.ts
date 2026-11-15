import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { EventEmitter } from 'node:events';
import { askFitBaseConcierge, type ChatTurn } from './server/aiConcierge.ts';
import {
  getSupabaseAdmin,
  getSupabaseAnon,
  getSupabasePublicConfig,
  isSupabaseConfigured,
  SupabaseConfigError,
} from './server/supabase.ts';
import {
  addDaysIso,
  computeDaysRemaining,
  ensureUploadsDir,
  getGymClasses,
  getMemberProfiles,
  getNotificationSettings,
  getProfileById,
  getTrainers,
  hashBiometricSignal,
  isMembershipExpired,
  isValidHardwareBiometricSignal,
  mapAttendanceRow,
  mapBiometricRow,
  mapClassRow,
  mapFeedbackRow,
  mapGoalRow,
  mapNotificationLogRow,
  mapNotificationSettingsRow,
  mapPasswordResetRow,
  mapPaymentRow,
  mapPerformanceRow,
  mapProfileRow,
  mapTrainerRow,
  sanitizeBiometricRow,
  TIER_DURATION_DAYS,
  TIER_FEES,
  UPLOADS_DIR,
  type StoredBiometricRow,
} from './server/store.ts';
import type {
  BiometricCaptureProtocol,
  BiometricEnrollmentStatus,
  BiometricTemplateFormat,
  BiometricVendor,
  ExpirationAlertSummary,
  MembershipTier,
  NotificationLogEntry,
  NotificationSettings,
  PaymentMethod,
  TrainerInput,
  TrainerPortraitKey,
  UserProfile,
} from './src/types.ts';

const PORT = Number(process.env.PORT || 3000);
const biometricEventBus = new EventEmitter();
biometricEventBus.setMaxListeners(50);

interface AuthedRequest extends Request {
  authUser?: UserProfile;
}

ensureUploadsDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadsDir();
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.pdf', '.svg'].includes(ext) ? ext : '.png';
    cb(null, `receipt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, WEBP, SVG, or PDF receipts are supported.'));
    }
  },
});

async function resolveUserFromToken(token: string): Promise<UserProfile | null> {
  if (!isSupabaseConfigured()) {
    throw new SupabaseConfigError();
  }
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }
  return getProfileById(data.user.id);
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const token = header.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  try {
    const profile = await resolveUserFromToken(token);
    if (!profile) {
      res.status(401).json({ error: 'Session expired or account not found. Please sign in again.' });
      return;
    }
    req.authUser = profile;
    next();
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      res.status(503).json({ error: err.message });
      return;
    }
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

function requireActiveMember(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (isMembershipExpired(req.authUser)) {
    res.status(403).json({ error: 'Membership Expired.' });
    return;
  }
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.authUser || req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access required.' });
    return;
  }
  next();
}

function requireStaff(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.authUser || (req.authUser.role !== 'admin' && req.authUser.role !== 'reception')) {
    res.status(403).json({ error: 'Reception or Administrator access required.' });
    return;
  }
  next();
}

function buildExpirationAlert(user: UserProfile, reminderDaysBefore: number): ExpirationAlertSummary {
  const endDate = user.subscriptionEndDate || addDaysIso(user.joinDate, 30);
  const daysRemaining = computeDaysRemaining(endDate);

  if (daysRemaining < 0 || user.membershipActive === false) {
    return {
      status: 'Expired',
      daysRemaining,
      subscriptionEndDate: endDate,
      message: 'Membership Expired.',
    };
  }

  if (daysRemaining <= reminderDaysBefore) {
    return {
      status: 'Expiring Soon',
      daysRemaining,
      subscriptionEndDate: endDate,
      message:
        daysRemaining === 0
          ? `Your FitBase subscription expires today (${endDate}). Please renew PKR ${user.monthlyFeePkr.toLocaleString('en-PK')} to avoid turnstile interruption.`
          : `Renewal due in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} (${endDate}). Submit PKR ${user.monthlyFeePkr.toLocaleString('en-PK')} via JazzCash, EasyPaisa, Bank Transfer, or Cash.`,
    };
  }

  return {
    status: 'Active',
    daysRemaining,
    subscriptionEndDate: endDate,
    message: `Subscription active through ${endDate} (${daysRemaining} days remaining).`,
  };
}

function normalizeWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    return `92${digits.slice(1)}`;
  }
  if (digits.startsWith('92')) {
    return digits;
  }
  return digits || '923128330203';
}

function buildWhatsAppMessage(user: UserProfile, daysRemaining: number): string {
  const timing =
    daysRemaining < 0
      ? `expired ${Math.abs(daysRemaining)} day(s) ago (${user.subscriptionEndDate})`
      : daysRemaining === 0
        ? `expires today (${user.subscriptionEndDate})`
        : `expires in ${daysRemaining} day(s) on ${user.subscriptionEndDate}`;
  return `Assalam-o-Alaikum ${user.name} (${user.memberCode}), your FitBase (${user.membershipTier}) membership ${timing}. Package dues: PKR ${user.monthlyFeePkr.toLocaleString('en-PK')}. Renew via JazzCash/EasyPaisa in the Member Portal or at Near Marhaba Mart, Green Avenue, East Canal Road, Faisalabad (0312-8330203).`;
}

async function dispatchWhatsAppReminder(
  user: UserProfile,
  daysRemaining: number,
  triggerType: 'Daily Cron' | 'Manual Run',
  settings: NotificationSettings
): Promise<NotificationLogEntry> {
  const now = new Date().toISOString();
  const messagePreview = buildWhatsAppMessage(user, daysRemaining);
  const waDigits = normalizeWhatsAppPhone(user.phone);
  const whatsappDeepLink = `https://wa.me/${waDigits}?text=${encodeURIComponent(messagePreview)}`;

  const cloudToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL?.trim();

  let provider: NotificationLogEntry['provider'] = 'WhatsApp Dispatch Queue';
  let deliveryStatus: NotificationLogEntry['deliveryStatus'] = 'Queued (Configure API Token)';
  let providerMessageId: string | undefined;

  if (cloudToken && phoneNumberId) {
    provider = 'WhatsApp Cloud API';
    try {
      const response = await fetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cloudToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: waDigits,
            type: 'text',
            text: { body: messagePreview },
          }),
        }
      );
      if (response.ok) {
        const json = (await response.json()) as { messages?: Array<{ id?: string }> };
        deliveryStatus = 'Delivered';
        providerMessageId = json.messages?.[0]?.id;
      } else {
        deliveryStatus = 'Failed';
      }
    } catch {
      deliveryStatus = 'Failed';
    }
  } else if (webhookUrl) {
    provider = 'WhatsApp Webhook';
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: `+${waDigits}`,
          memberCode: user.memberCode,
          memberName: user.name,
          subscriptionEndDate: user.subscriptionEndDate,
          daysRemaining,
          message: messagePreview,
        }),
      });
      deliveryStatus = response.ok ? 'Delivered' : 'Failed';
    } catch {
      deliveryStatus = 'Failed';
    }
  }

  const logEntry: NotificationLogEntry = {
    id: `ntf-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    memberId: user.id,
    memberName: user.name,
    memberCode: user.memberCode,
    phone: user.phone,
    channel: settings.whatsappEnabled ? 'WhatsApp' : 'In-Portal',
    provider: settings.whatsappEnabled ? provider : 'Member Portal Alert',
    daysRemaining,
    subscriptionEndDate: user.subscriptionEndDate || new Date().toISOString().slice(0, 10),
    messagePreview,
    deliveryStatus: settings.whatsappEnabled ? deliveryStatus : 'Delivered',
    providerMessageId,
    whatsappDeepLink,
    dispatchedAt: now,
    triggerType,
  };

  const supabase = getSupabaseAdmin();
  await supabase.from('notification_logs').insert({
    id: logEntry.id,
    member_id: logEntry.memberId,
    member_name: logEntry.memberName,
    member_code: logEntry.memberCode,
    phone: logEntry.phone,
    channel: logEntry.channel,
    provider: logEntry.provider,
    days_remaining: logEntry.daysRemaining,
    subscription_end_date: logEntry.subscriptionEndDate,
    message_preview: logEntry.messagePreview,
    delivery_status: logEntry.deliveryStatus,
    provider_message_id: logEntry.providerMessageId || null,
    whatsapp_deep_link: logEntry.whatsappDeepLink || null,
    dispatched_at: logEntry.dispatchedAt,
    trigger_type: logEntry.triggerType,
  });

  await supabase.from('profiles').update({ last_reminder_sent_at: now }).eq('id', user.id);

  return logEntry;
}

async function runExpirationSweep(triggerType: 'Daily Cron' | 'Manual Run') {
  const supabase = getSupabaseAdmin();
  const [settings, members] = await Promise.all([getNotificationSettings(), getMemberProfiles()]);
  const today = new Date().toISOString().slice(0, 10);
  const windowDays = settings.reminderDaysBefore ?? 5;
  let dispatchedCount = 0;

  for (const user of members) {
    if (user.membershipActive === false) continue;
    const endDate = user.subscriptionEndDate || addDaysIso(user.joinDate, 30);
    const daysRemaining = computeDaysRemaining(endDate);
    if (daysRemaining > windowDays) continue;

    if (triggerType === 'Daily Cron' && user.lastReminderSentAt?.startsWith(today)) {
      continue;
    }

    await dispatchWhatsAppReminder(
      { ...user, subscriptionEndDate: endDate },
      daysRemaining,
      triggerType,
      settings
    );
    dispatchedCount += 1;
  }

  const now = new Date().toISOString();
  await supabase
    .from('notification_settings')
    .upsert({
      id: 1,
      reminder_days_before: settings.reminderDaysBefore,
      daily_cron_time: settings.dailyCronTime,
      whatsapp_enabled: settings.whatsappEnabled,
      last_sweep_at: now,
      last_sweep_matched_count: dispatchedCount,
    });

  return { dispatchedCount, lastSweepAt: now };
}

function createTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return `FB-${suffix}`;
}

function buildPasswordResetWhatsAppLink(user: UserProfile, tempPassword: string): string {
  const waDigits = normalizeWhatsAppPhone(user.phone);
  const text = `Assalam-o-Alaikum ${user.name} (${user.memberCode}), your FitBase Member Portal password has been reset by Reception. Email: ${user.email} | Temporary Password: ${tempPassword}. Please sign in at the FitBase Member Portal.`;
  return `https://wa.me/${waDigits}?text=${encodeURIComponent(text)}`;
}

async function nextMemberCode(): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'member');
  const base = 1001 + (count || 0);
  const candidate = `FB-${base}`;
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('member_code', candidate)
    .maybeSingle();
  if (!existing) return candidate;
  return `FB-${base}-${crypto.randomInt(10, 99)}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Serve uploaded payment receipts
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Public Supabase browser config (URL + non-secret Anon key only)
  app.get('/api/public/config', (_req, res) => {
    res.json(getSupabasePublicConfig());
  });

  // Public overview: classes, trainers, tier catalog (safe when Supabase not yet configured)
  app.get('/api/public/overview', async (_req, res) => {
    if (!isSupabaseConfigured()) {
      res.json({ classes: [], trainers: [], tiers: TIER_FEES });
      return;
    }
    try {
      const [classes, trainers] = await Promise.all([getGymClasses(), getTrainers()]);
      res.json({ classes, trainers, tiers: TIER_FEES });
    } catch {
      res.json({ classes: [], trainers: [], tiers: TIER_FEES });
    }
  });

  // FitBase AI Concierge Chatbot (Server-Side @google/genai)
  app.post('/api/chat', async (req, res) => {
    const { message, history } = req.body as {
      message?: string;
      history?: ChatTurn[];
    };

    if (!message?.trim()) {
      res.status(400).json({ error: 'Please type a message before sending.' });
      return;
    }

    try {
      let trainers = [] as Awaited<ReturnType<typeof getTrainers>>;
      let classes = [] as Awaited<ReturnType<typeof getGymClasses>>;
      if (isSupabaseConfigured()) {
        [trainers, classes] = await Promise.all([getTrainers(), getGymClasses()]);
      }
      const reply = await askFitBaseConcierge({
        message,
        history,
        trainers,
        classes,
      });
      res.json({ reply });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'FitBase AI Concierge is temporarily unavailable. Please try again.';
      const status = msg.includes('GEMINI_API_KEY') ? 503 : 500;
      res.status(status).json({ error: msg });
    }
  });

  // Public inquiry / contact form -> lands in Admin Feedback Inbox
  app.post('/api/public/inquiries', async (req, res, next) => {
    try {
      const { name, email, message, category } = req.body as {
        name?: string;
        email?: string;
        message?: string;
        category?: string;
      };

      if (!name?.trim() || !email?.trim() || !message?.trim()) {
        res.status(400).json({ error: 'Name, email, and message are required.' });
        return;
      }

      const supabase = getSupabaseAdmin();
      const now = new Date().toISOString();
      const id = `fbk-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const resolvedCategory =
        category === 'Billing' || category === 'Trainer' ? category : 'General Inquiry';

      const { data, error } = await supabase
        .from('feedback_entries')
        .insert({
          id,
          member_id: null,
          author_name: name.trim(),
          author_email: email.trim().toLowerCase(),
          category: resolvedCategory,
          rating: 5,
          message: message.trim(),
          status: 'Open',
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single();

      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }

      res.status(201).json({ entry: mapFeedbackRow(data as Record<string, unknown>) });
    } catch (err) {
      next(err);
    }
  });

  // Auth: Login via Supabase Auth + strict membership expiry check
  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email?.trim() || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const supabaseAnon = getSupabaseAnon();
      const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError || !authData.user || !authData.session) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const profile = await getProfileById(authData.user.id);
      if (!profile) {
        res.status(403).json({
          error: 'Account profile record not found. Please contact FitBase Reception.',
        });
        return;
      }

      if (isMembershipExpired(profile)) {
        res.status(403).json({ error: 'Membership Expired.' });
        return;
      }

      res.json({
        token: authData.session.access_token,
        refreshToken: authData.session.refresh_token,
        user: profile,
      });
    } catch (err) {
      next(err);
    }
  });

  // Auth: Register new member via Supabase Auth + profiles table
  app.post('/api/auth/register', async (req, res, next) => {
    try {
      const { name, email, phone, password, membershipTier } = req.body as {
        name?: string;
        email?: string;
        phone?: string;
        password?: string;
        membershipTier?: MembershipTier;
      };

      if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
        res.status(400).json({ error: 'Name, valid email, and password (min 6 chars) are required.' });
        return;
      }

      const tier: MembershipTier =
        membershipTier && TIER_FEES[membershipTier] ? membershipTier : 'Official Package';
      const normalizedEmail = email.trim().toLowerCase();

      const supabaseAdmin = getSupabaseAdmin();
      const supabaseAnon = getSupabaseAnon();

      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (existingProfile) {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }

      const { data: createdAuth, error: createAuthError } =
        await supabaseAdmin.auth.admin.createUser({
          email: normalizedEmail,
          password,
          email_confirm: true,
          user_metadata: { name: name.trim() },
        });

      if (createAuthError || !createdAuth.user) {
        const status = createAuthError?.message?.toLowerCase().includes('already') ? 409 : 400;
        res.status(status).json({
          error: createAuthError?.message || 'Unable to register account.',
        });
        return;
      }

      const trainers = await getTrainers();
      const memberCode = await nextMemberCode();
      const today = new Date().toISOString().slice(0, 10);
      const endDate = addDaysIso(today, TIER_DURATION_DAYS[tier] || 30);

      const { data: insertedProfile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: createdAuth.user.id,
          member_code: memberCode,
          name: name.trim(),
          email: normalizedEmail,
          phone: phone?.trim() || '+92 312 8330203',
          role: 'member',
          membership_tier: tier,
          base_monthly_fee_pkr: TIER_FEES[tier],
          discount_pkr: 0,
          monthly_fee_pkr: TIER_FEES[tier],
          fee_status: 'Overdue',
          fee_paid_through: 'Unpaid',
          subscription_end_date: endDate,
          join_date: today,
          assigned_trainer_id: trainers[0]?.id || null,
          membership_active: true,
          biometric_status: 'Not Enrolled',
        })
        .select('*')
        .single();

      if (profileError || !insertedProfile) {
        await supabaseAdmin.auth.admin.deleteUser(createdAuth.user.id);
        res.status(400).json({ error: profileError?.message || 'Unable to create member profile.' });
        return;
      }

      const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError || !signInData.session) {
        res.status(500).json({ error: 'Account created, please sign in.' });
        return;
      }

      res.status(201).json({
        token: signInData.session.access_token,
        refreshToken: signInData.session.refresh_token,
        user: mapProfileRow(insertedProfile as Record<string, unknown>),
      });
    } catch (err) {
      next(err);
    }
  });

  // Auth: Member Forgot Password -> triggers reset request in Reception Portal
  app.post('/api/auth/forgot-password', async (req, res, next) => {
    try {
      const { identifier, phone, note } = req.body as {
        identifier?: string;
        phone?: string;
        note?: string;
      };

      if (!identifier?.trim() || !phone?.trim()) {
        res.status(400).json({
          error: 'Email address (or Member ID) and registered phone number are required.',
        });
        return;
      }

      const supabase = getSupabaseAdmin();
      const lookup = identifier.trim();

      let memberRow: Record<string, unknown> | null = null;
      const { data: byEmail } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'member')
        .ilike('email', lookup)
        .limit(1)
        .maybeSingle();

      if (byEmail) {
        memberRow = byEmail as Record<string, unknown>;
      } else {
        const { data: byCode } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'member')
          .ilike('member_code', lookup)
          .limit(1)
          .maybeSingle();
        if (byCode) {
          memberRow = byCode as Record<string, unknown>;
        }
      }
      if (!memberRow) {
        res.status(404).json({
          error: 'No FitBase member account found matching that email or member code.',
        });
        return;
      }

      const member = mapProfileRow(memberRow);
      const now = new Date().toISOString();

      const { data: existingPending } = await supabase
        .from('password_reset_requests')
        .select('*')
        .eq('member_id', member.id)
        .eq('status', 'Pending')
        .maybeSingle();

      let savedRequest;
      if (existingPending) {
        const { data: updated, error: updateErr } = await supabase
          .from('password_reset_requests')
          .update({
            phone_provided: phone.trim(),
            note: note?.trim() || String(existingPending.note || 'Member forgot password.'),
            requested_at: now,
          })
          .eq('id', existingPending.id)
          .select('*')
          .single();
        if (updateErr) throw new Error(updateErr.message);
        savedRequest = mapPasswordResetRow(updated as Record<string, unknown>);
      } else {
        const newId = `pwr-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
        const { data: inserted, error: insertErr } = await supabase
          .from('password_reset_requests')
          .insert({
            id: newId,
            member_id: member.id,
            member_code: member.memberCode,
            member_name: member.name,
            email: member.email,
            phone_provided: phone.trim(),
            registered_phone: member.phone,
            note: note?.trim() || 'Member requested password reset from login screen.',
            status: 'Pending',
            trigger_source: 'Member Forgot Password',
            requested_at: now,
          })
          .select('*')
          .single();
        if (insertErr) throw new Error(insertErr.message);
        savedRequest = mapPasswordResetRow(inserted as Record<string, unknown>);
      }

      res.status(201).json({
        request: {
          id: savedRequest.id,
          memberCode: savedRequest.memberCode,
          memberName: savedRequest.memberName,
          status: savedRequest.status,
          requestedAt: savedRequest.requestedAt,
        },
        message:
          'Your password reset request has been sent to the FitBase Reception Desk. Visit reception or contact 0312-8330203 on WhatsApp to receive your temporary password.',
      });
    } catch (err) {
      next(err);
    }
  });

  // Auth: Current session (strict membership expiry enforcement)
  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    if (isMembershipExpired(req.authUser!)) {
      res.status(403).json({ error: 'Membership Expired.' });
      return;
    }
    res.json({ user: req.authUser! });
  });

  // Member Portal: Complete Dashboard Payload
  app.get(
    '/api/member/dashboard',
    requireAuth,
    requireActiveMember,
    async (req: AuthedRequest, res, next) => {
      try {
        const supabase = getSupabaseAdmin();
        const memberId = req.authUser!.id;

        const [
          settings,
          notifRes,
          perfRes,
          goalsRes,
          attRes,
          payRes,
          classes,
          fbRes,
          trainers,
        ] = await Promise.all([
          getNotificationSettings(),
          supabase
            .from('notification_logs')
            .select('*')
            .eq('member_id', memberId)
            .order('dispatched_at', { ascending: false }),
          supabase
            .from('performance_logs')
            .select('*')
            .eq('member_id', memberId)
            .order('date', { ascending: true }),
          supabase.from('member_goals').select('*').eq('member_id', memberId),
          supabase
            .from('attendance_logs')
            .select('*')
            .eq('member_id', memberId)
            .order('check_in_time', { ascending: false }),
          supabase
            .from('payment_submissions')
            .select('*')
            .eq('member_id', memberId)
            .order('submitted_at', { ascending: false }),
          getGymClasses(),
          supabase
            .from('feedback_entries')
            .select('*')
            .eq('member_id', memberId)
            .order('created_at', { ascending: false }),
          getTrainers(),
        ]);

        res.json({
          profile: req.authUser!,
          expirationAlert: buildExpirationAlert(req.authUser!, settings.reminderDaysBefore),
          notifications: (notifRes.data || []).map((r) =>
            mapNotificationLogRow(r as Record<string, unknown>)
          ),
          performanceLogs: (perfRes.data || []).map((r) =>
            mapPerformanceRow(r as Record<string, unknown>)
          ),
          goals: (goalsRes.data || []).map((r) => mapGoalRow(r as Record<string, unknown>)),
          attendanceLogs: (attRes.data || []).map((r) =>
            mapAttendanceRow(r as Record<string, unknown>)
          ),
          payments: (payRes.data || []).map((r) => mapPaymentRow(r as Record<string, unknown>)),
          classes,
          feedback: (fbRes.data || []).map((r) => mapFeedbackRow(r as Record<string, unknown>)),
          trainers,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Member Portal: Toggle Class Booking
  app.post(
    '/api/member/classes/:classId/toggle',
    requireAuth,
    requireActiveMember,
    async (req: AuthedRequest, res, next) => {
      try {
        const supabase = getSupabaseAdmin();
        const { data: clsRow, error: clsErr } = await supabase
          .from('gym_classes')
          .select('*')
          .eq('id', req.params.classId)
          .maybeSingle();

        if (clsErr) throw new Error(clsErr.message);
        if (!clsRow) {
          res.status(404).json({ error: 'Class not found.' });
          return;
        }

        const cls = mapClassRow(clsRow as Record<string, unknown>);
        const userId = req.authUser!.id;
        const isBooked = cls.bookedMemberIds.includes(userId);
        let nextBooked: string[];

        if (isBooked) {
          nextBooked = cls.bookedMemberIds.filter((id) => id !== userId);
        } else {
          if (cls.bookedMemberIds.length >= cls.capacity) {
            res.status(400).json({ error: 'Class is currently at full capacity.' });
            return;
          }
          nextBooked = [...cls.bookedMemberIds, userId];
        }

        const { error: updateErr } = await supabase
          .from('gym_classes')
          .update({ booked_member_ids: nextBooked })
          .eq('id', cls.id);
        if (updateErr) throw new Error(updateErr.message);

        const classes = await getGymClasses();
        res.json({ classes, booked: !isBooked });
      } catch (err) {
        next(err);
      }
    }
  );

  // Member Portal: Log Performance Metric
  app.post(
    '/api/member/performance',
    requireAuth,
    requireActiveMember,
    async (req: AuthedRequest, res, next) => {
      try {
        const { date, metric, category, value, unit, notes } = req.body as {
          date?: string;
          metric?: string;
          category?: 'Strength Lift' | 'Conditioning' | 'Body Composition';
          value?: number;
          unit?: string;
          notes?: string;
        };

        if (!metric?.trim() || typeof value !== 'number' || Number.isNaN(value) || !unit?.trim()) {
          res.status(400).json({ error: 'Metric name, numeric value, and unit are required.' });
          return;
        }

        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('performance_logs')
          .insert({
            id: `prf-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
            member_id: req.authUser!.id,
            date: date || new Date().toISOString().slice(0, 10),
            metric: metric.trim(),
            category: category || 'Strength Lift',
            value,
            unit: unit.trim(),
            notes: notes?.trim() || '',
          })
          .select('*')
          .single();

        if (error) throw new Error(error.message);
        res.status(201).json({ entry: mapPerformanceRow(data as Record<string, unknown>) });
      } catch (err) {
        next(err);
      }
    }
  );

  app.delete(
    '/api/member/performance/:logId',
    requireAuth,
    requireActiveMember,
    async (req: AuthedRequest, res, next) => {
      try {
        const supabase = getSupabaseAdmin();
        const { data: deleted, error } = await supabase
          .from('performance_logs')
          .delete()
          .eq('id', req.params.logId)
          .eq('member_id', req.authUser!.id)
          .select('id');

        if (error) throw new Error(error.message);
        if (!deleted || deleted.length === 0) {
          res.status(404).json({ error: 'Performance entry not found.' });
          return;
        }
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  // Member Portal: Goals CRUD
  app.post(
    '/api/member/goals',
    requireAuth,
    requireActiveMember,
    async (req: AuthedRequest, res, next) => {
      try {
        const { title, metric, startValue, currentValue, targetValue, unit, deadline } = req.body as {
          title?: string;
          metric?: string;
          startValue?: number;
          currentValue?: number;
          targetValue?: number;
          unit?: string;
          deadline?: string;
        };

        if (
          !title?.trim() ||
          !metric?.trim() ||
          typeof targetValue !== 'number' ||
          !unit?.trim() ||
          !deadline
        ) {
          res
            .status(400)
            .json({ error: 'Title, metric, target value, unit, and deadline are required.' });
          return;
        }

        const start = typeof startValue === 'number' ? startValue : 0;
        const current = typeof currentValue === 'number' ? currentValue : start;
        const status = current >= targetValue && targetValue > start ? 'Achieved' : 'Active';

        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('member_goals')
          .insert({
            id: `gol-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
            member_id: req.authUser!.id,
            title: title.trim(),
            metric: metric.trim(),
            start_value: start,
            current_value: current,
            target_value: targetValue,
            unit: unit.trim(),
            deadline,
            status,
          })
          .select('*')
          .single();

        if (error) throw new Error(error.message);
        res.status(201).json({ goal: mapGoalRow(data as Record<string, unknown>) });
      } catch (err) {
        next(err);
      }
    }
  );

  app.patch(
    '/api/member/goals/:goalId',
    requireAuth,
    requireActiveMember,
    async (req: AuthedRequest, res, next) => {
      try {
        const { currentValue, status } = req.body as {
          currentValue?: number;
          status?: 'Active' | 'Achieved';
        };

        const patch: Record<string, unknown> = {};
        if (typeof currentValue === 'number' && !Number.isNaN(currentValue)) {
          patch.current_value = currentValue;
        }
        if (status === 'Active' || status === 'Achieved') {
          patch.status = status;
        }

        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('member_goals')
          .update(patch)
          .eq('id', req.params.goalId)
          .eq('member_id', req.authUser!.id)
          .select('*')
          .maybeSingle();

        if (error) throw new Error(error.message);
        if (!data) {
          res.status(404).json({ error: 'Goal not found.' });
          return;
        }
        res.json({ goal: mapGoalRow(data as Record<string, unknown>) });
      } catch (err) {
        next(err);
      }
    }
  );

  app.delete(
    '/api/member/goals/:goalId',
    requireAuth,
    requireActiveMember,
    async (req: AuthedRequest, res, next) => {
      try {
        const supabase = getSupabaseAdmin();
        const { data: deleted, error } = await supabase
          .from('member_goals')
          .delete()
          .eq('id', req.params.goalId)
          .eq('member_id', req.authUser!.id)
          .select('id');

        if (error) throw new Error(error.message);
        if (!deleted || deleted.length === 0) {
          res.status(404).json({ error: 'Goal not found.' });
          return;
        }
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  // Member Portal: Log Today's Attendance Check-in
  app.post(
    '/api/member/attendance/checkin',
    requireAuth,
    requireActiveMember,
    async (req: AuthedRequest, res, next) => {
      try {
        const { zoneOrClass } = req.body as { zoneOrClass?: string };
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('attendance_logs')
          .insert({
            id: `att-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
            member_id: req.authUser!.id,
            member_name: req.authUser!.name,
            member_code: req.authUser!.memberCode,
            check_in_time: new Date().toISOString(),
            zone_or_class: zoneOrClass?.trim() || 'Main Iron Rack Bay',
            verified_by: 'Member Self Check-In',
            verification_source: 'Member Self Check-In',
            fee_status_at_check_in: req.authUser!.feeStatus,
            access_outcome:
              req.authUser!.feeStatus === 'Paid' ? 'Granted' : 'Granted with Due Alert',
          })
          .select('*')
          .single();

        if (error) throw new Error(error.message);
        res.status(201).json({ entry: mapAttendanceRow(data as Record<string, unknown>) });
      } catch (err) {
        next(err);
      }
    }
  );

  // Member Portal: Submit Payment Proof
  app.post(
    '/api/member/payments',
    requireAuth,
    requireActiveMember,
    upload.single('receipt'),
    async (req: AuthedRequest, res, next) => {
      try {
        const { method, transactionRef, billingMonth, amountPkr, notes } = req.body as {
          method?: PaymentMethod;
          transactionRef?: string;
          billingMonth?: string;
          amountPkr?: string;
          notes?: string;
        };

        const validMethods: PaymentMethod[] = ['JazzCash', 'EasyPaisa', 'Cash', 'Bank Transfer'];
        if (!method || !validMethods.includes(method)) {
          res.status(400).json({
            error: 'Select a valid payment method (JazzCash, EasyPaisa, Cash, or Bank Transfer).',
          });
          return;
        }

        if (!transactionRef?.trim()) {
          res.status(400).json({ error: 'Transaction Reference / Receipt Number is required.' });
          return;
        }

        if (method !== 'Cash' && !req.file) {
          res.status(400).json({
            error: 'Please upload a payment screenshot or receipt for online/bank verification.',
          });
          return;
        }

        const user = req.authUser!;
        const parsedAmount = Number(amountPkr) || user.monthlyFeePkr || 7000;
        const supabase = getSupabaseAdmin();

        const { data: insertedPay, error: payErr } = await supabase
          .from('payment_submissions')
          .insert({
            id: `pay-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
            member_id: user.id,
            member_name: user.name,
            member_code: user.memberCode,
            membership_tier: user.membershipTier,
            billing_month: billingMonth?.trim() || new Date().toISOString().slice(0, 7),
            amount_pkr: parsedAmount,
            method,
            transaction_ref: transactionRef.trim(),
            receipt_url: req.file ? `/uploads/${req.file.filename}` : null,
            receipt_file_name: req.file ? req.file.originalname : null,
            notes: notes?.trim() || '',
            status: 'Pending',
            submitted_at: new Date().toISOString(),
          })
          .select('*')
          .single();

        if (payErr) throw new Error(payErr.message);

        const { data: updatedProfile, error: profErr } = await supabase
          .from('profiles')
          .update({ fee_status: 'Pending Verification' })
          .eq('id', user.id)
          .select('*')
          .single();

        if (profErr) throw new Error(profErr.message);

        res.status(201).json({
          payment: mapPaymentRow(insertedPay as Record<string, unknown>),
          profile: mapProfileRow(updatedProfile as Record<string, unknown>),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Member Portal: Submit Feedback
  app.post(
    '/api/member/feedback',
    requireAuth,
    requireActiveMember,
    async (req: AuthedRequest, res, next) => {
      try {
        const { category, trainerId, rating, message } = req.body as {
          category?: 'Equipment' | 'Trainer' | 'Facility' | 'Billing';
          trainerId?: string;
          rating?: number;
          message?: string;
        };

        if (!message?.trim()) {
          res.status(400).json({ error: 'Feedback message cannot be empty.' });
          return;
        }

        const supabase = getSupabaseAdmin();
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from('feedback_entries')
          .insert({
            id: `fbk-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
            member_id: req.authUser!.id,
            author_name: req.authUser!.name,
            author_email: req.authUser!.email,
            category: category || 'Facility',
            trainer_id: trainerId || null,
            rating: typeof rating === 'number' ? Math.min(5, Math.max(1, rating)) : 5,
            message: message.trim(),
            status: 'Open',
            created_at: now,
            updated_at: now,
          })
          .select('*')
          .single();

        if (error) throw new Error(error.message);
        res.status(201).json({ entry: mapFeedbackRow(data as Record<string, unknown>) });
      } catch (err) {
        next(err);
      }
    }
  );

  // Admin Portal: Overview Payload
  app.get('/api/admin/overview', requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const supabase = getSupabaseAdmin();
      const [
        members,
        trainers,
        settings,
        payRes,
        fbRes,
        attRes,
        bioRes,
        notifRes,
      ] = await Promise.all([
        getMemberProfiles(),
        getTrainers(),
        getNotificationSettings(),
        supabase
          .from('payment_submissions')
          .select('*')
          .order('submitted_at', { ascending: false }),
        supabase.from('feedback_entries').select('*').order('created_at', { ascending: false }),
        supabase
          .from('attendance_logs')
          .select('*')
          .order('check_in_time', { ascending: false })
          .limit(30),
        supabase.from('biometric_profiles').select('*'),
        supabase
          .from('notification_logs')
          .select('*')
          .order('dispatched_at', { ascending: false })
          .limit(200),
      ]);

      const payments = (payRes.data || []).map((r) => mapPaymentRow(r as Record<string, unknown>));
      const feedback = (fbRes.data || []).map((r) => mapFeedbackRow(r as Record<string, unknown>));
      const attendance = (attRes.data || []).map((r) =>
        mapAttendanceRow(r as Record<string, unknown>)
      );
      const biometrics = (bioRes.data || []).map((r) =>
        sanitizeBiometricRow(mapBiometricRow(r as Record<string, unknown>))
      );
      const notificationLogs = (notifRes.data || []).map((r) =>
        mapNotificationLogRow(r as Record<string, unknown>)
      );

      const currentMonth = new Date().toISOString().slice(0, 7);
      const todayPrefix = new Date().toISOString().slice(0, 10);

      const collectedThisMonthPkr = payments
        .filter((p) => p.status === 'Approved' && p.billingMonth === currentMonth)
        .reduce((acc, p) => acc + p.amountPkr, 0);

      const avgTrainerRating =
        trainers.length > 0
          ? Number(
              (trainers.reduce((acc, t) => acc + t.rating, 0) / trainers.length).toFixed(2)
            )
          : 0;

      const expiringSoonCount = members.filter(
        (m) =>
          m.membershipActive !== false &&
          computeDaysRemaining(m.subscriptionEndDate) <= settings.reminderDaysBefore
      ).length;

      res.json({
        metrics: {
          totalMembers: members.length,
          paidMembers: members.filter((m) => m.feeStatus === 'Paid').length,
          pendingVerifications: payments.filter((p) => p.status === 'Pending').length,
          overdueMembers: members.filter((m) => m.feeStatus === 'Overdue').length,
          collectedThisMonthPkr,
          avgTrainerRating,
          openFeedbackCount: feedback.filter((f) => f.status !== 'Resolved').length,
          todayCheckIns: attendance.filter((a) => a.checkInTime.startsWith(todayPrefix)).length,
          expiringSoonCount,
        },
        members,
        payments,
        trainers,
        feedback,
        attendance,
        biometrics,
        notificationLogs,
        notificationSettings: settings,
      });
    } catch (err) {
      next(err);
    }
  });

  // Reception & Staff Operations Overview
  app.get('/api/reception/overview', requireAuth, requireStaff, async (_req, res, next) => {
    try {
      const supabase = getSupabaseAdmin();
      const [
        members,
        trainers,
        settings,
        bioRes,
        payRes,
        attRes,
        notifRes,
        resetRes,
      ] = await Promise.all([
        getMemberProfiles(),
        getTrainers(),
        getNotificationSettings(),
        supabase.from('biometric_profiles').select('*'),
        supabase
          .from('payment_submissions')
          .select('*')
          .order('submitted_at', { ascending: false }),
        supabase
          .from('attendance_logs')
          .select('*')
          .order('check_in_time', { ascending: false })
          .limit(40),
        supabase
          .from('notification_logs')
          .select('*')
          .order('dispatched_at', { ascending: false })
          .limit(200),
        supabase
          .from('password_reset_requests')
          .select('*')
          .order('requested_at', { ascending: false }),
      ]);

      const biometrics = (bioRes.data || []).map((r) =>
        sanitizeBiometricRow(mapBiometricRow(r as Record<string, unknown>))
      );
      const payments = (payRes.data || []).map((r) => mapPaymentRow(r as Record<string, unknown>));
      const attendance = (attRes.data || []).map((r) =>
        mapAttendanceRow(r as Record<string, unknown>)
      );
      const notificationLogs = (notifRes.data || []).map((r) =>
        mapNotificationLogRow(r as Record<string, unknown>)
      );
      const resetRequests = (resetRes.data || []).map((r) =>
        mapPasswordResetRow(r as Record<string, unknown>)
      );

      const sortedResetRequests = [...resetRequests].sort((a, b) => {
        if (a.status === 'Pending' && b.status !== 'Pending') return -1;
        if (a.status !== 'Pending' && b.status === 'Pending') return 1;
        return b.requestedAt.localeCompare(a.requestedAt);
      });

      const todayPrefix = new Date().toISOString().slice(0, 10);
      const todayLogs = attendance.filter((a) => a.checkInTime.startsWith(todayPrefix));
      const enrolledCount = biometrics.filter((b) => b.enrollmentStatus === 'Enrolled').length;
      const overdueMembers = members.filter((m) => m.feeStatus === 'Overdue');
      const pendingMembers = members.filter((m) => m.feeStatus === 'Pending Verification');
      const totalPendingDuesPkr = [...overdueMembers, ...pendingMembers].reduce(
        (acc, m) => acc + (m.monthlyFeePkr || 0),
        0
      );
      const expiringSoonCount = members.filter(
        (m) =>
          m.membershipActive !== false &&
          computeDaysRemaining(m.subscriptionEndDate) <= settings.reminderDaysBefore
      ).length;

      res.json({
        metrics: {
          todayCheckIns: todayLogs.length,
          biometricCheckInsToday: todayLogs.filter(
            (a) => a.verificationSource === 'Biometric Scanner'
          ).length,
          enrolledMembers: enrolledCount,
          totalMembers: members.length,
          overdueCount: overdueMembers.length,
          pendingVerificationCount: pendingMembers.length,
          totalPendingDuesPkr,
          expiringSoonCount,
          pendingPasswordResets: sortedResetRequests.filter((r) => r.status === 'Pending').length,
        },
        members,
        biometrics,
        payments,
        attendance,
        trainers,
        notificationLogs,
        notificationSettings: settings,
        passwordResetRequests: sortedResetRequests,
      });
    } catch (err) {
      next(err);
    }
  });

  // Reception / Staff: Create Member Profile
  app.post(
    '/api/reception/members',
    requireAuth,
    requireStaff,
    async (req: AuthedRequest, res, next) => {
      try {
        const {
          name,
          email,
          phone,
          membershipTier,
          discountPkr,
          discountReason,
          subscriptionEndDate,
          assignedTrainerId,
          emergencyContact,
          cnicLast4,
          staffNotes,
          password,
          biometricCapture,
        } = req.body as {
          name?: string;
          email?: string;
          phone?: string;
          membershipTier?: MembershipTier;
          discountPkr?: number;
          discountReason?: string;
          subscriptionEndDate?: string;
          assignedTrainerId?: string;
          emergencyContact?: string;
          cnicLast4?: string;
          staffNotes?: string;
          password?: string;
          biometricCapture?: {
            sensorVendor?: BiometricVendor;
            fingerLabel?: 'Right Index' | 'Right Thumb' | 'Left Index' | 'Left Thumb';
            rawSignal?: string;
            qualityScore?: number;
            hardwareSerial?: string;
            captureProtocol?: BiometricCaptureProtocol;
            templateFormat?: BiometricTemplateFormat;
            credentialId?: string;
          };
        };

        if (!name?.trim() || !email?.trim() || !phone?.trim()) {
          res.status(400).json({ error: 'Name, email, and phone are required.' });
          return;
        }

        if (
          biometricCapture &&
          !isValidHardwareBiometricSignal(biometricCapture.rawSignal, biometricCapture.credentialId)
        ) {
          res.status(400).json({
            error:
              'Invalid or simulated biometric payload. Capture a live fingerprint directly from connected scanner hardware.',
          });
          return;
        }

        const supabase = getSupabaseAdmin();
        const normalizedEmail = email.trim().toLowerCase();

        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', normalizedEmail)
          .maybeSingle();

        if (existingProfile) {
          res.status(409).json({ error: 'A member with this email already exists.' });
          return;
        }

        const initialPassword =
          password && password.length >= 6 ? password : createTemporaryPassword();

        const { data: createdAuth, error: createAuthError } =
          await supabase.auth.admin.createUser({
            email: normalizedEmail,
            password: initialPassword,
            email_confirm: true,
            user_metadata: { name: name.trim() },
          });

        if (createAuthError || !createdAuth.user) {
          res.status(400).json({
            error: createAuthError?.message || 'Unable to provision auth user for member.',
          });
          return;
        }

        const tier: MembershipTier =
          membershipTier && TIER_FEES[membershipTier] ? membershipTier : 'Official Package';
        const baseFee = TIER_FEES[tier];
        const parsedDiscount = Math.min(
          baseFee,
          Math.max(0, Math.round(Number(discountPkr) || 0))
        );
        const finalFee = Math.max(0, baseFee - parsedDiscount);
        const today = new Date().toISOString().slice(0, 10);
        const memberCode = await nextMemberCode();
        const resolvedEndDate =
          subscriptionEndDate?.trim() || addDaysIso(today, TIER_DURATION_DAYS[tier] || 30);

        const { data: insertedProfile, error: profErr } = await supabase
          .from('profiles')
          .insert({
            id: createdAuth.user.id,
            member_code: memberCode,
            name: name.trim(),
            email: normalizedEmail,
            phone: phone.trim(),
            role: 'member',
            membership_tier: tier,
            base_monthly_fee_pkr: baseFee,
            discount_pkr: parsedDiscount,
            discount_reason:
              parsedDiscount > 0 ? discountReason?.trim() || 'Reception Desk Discount' : '',
            monthly_fee_pkr: finalFee,
            fee_status: 'Overdue',
            fee_paid_through: 'Unpaid',
            subscription_end_date: resolvedEndDate,
            join_date: today,
            assigned_trainer_id: assignedTrainerId?.trim() || null,
            emergency_contact: emergencyContact?.trim() || '',
            cnic_last4: cnicLast4 ? cnicLast4.replace(/\D/g, '').slice(-4) : '',
            membership_active: true,
            biometric_status: biometricCapture ? 'Enrolled' : 'Not Enrolled',
            biometric_finger_label: biometricCapture?.fingerLabel || null,
            staff_notes: staffNotes?.trim() || `Created at desk by ${req.authUser!.name}`,
          })
          .select('*')
          .single();

        if (profErr || !insertedProfile) {
          await supabase.auth.admin.deleteUser(createdAuth.user.id);
          res.status(400).json({ error: profErr?.message || 'Unable to save member profile.' });
          return;
        }

        let createdBio: StoredBiometricRow | undefined;
        if (biometricCapture) {
          const tokenSource = (
            biometricCapture.rawSignal ||
            biometricCapture.credentialId ||
            ''
          ).trim();
          const now = new Date().toISOString();
          const { data: bioRow, error: bioErr } = await supabase
            .from('biometric_profiles')
            .insert({
              id: `bio-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
              member_id: createdAuth.user.id,
              member_code: memberCode,
              sensor_vendor: biometricCapture.sensorVendor || 'ZKTeco SLK20R',
              finger_label: biometricCapture.fingerLabel || 'Right Index',
              enrollment_status: 'Enrolled',
              quality_score:
                typeof biometricCapture.qualityScore === 'number'
                  ? Math.min(100, Math.max(50, biometricCapture.qualityScore))
                  : 95,
              enrolled_at: now,
              enrolled_by: req.authUser!.name,
              template_hash: hashBiometricSignal(tokenSource),
              hardware_serial: biometricCapture.hardwareSerial?.trim() || null,
              capture_protocol: biometricCapture.captureProtocol || 'Local SDK Bridge',
              template_format: biometricCapture.templateFormat || 'ISO-19794-2',
              credential_id: biometricCapture.credentialId?.trim() || null,
            })
            .select('*')
            .single();

          if (bioErr) throw new Error(bioErr.message);
          createdBio = mapBiometricRow(bioRow as Record<string, unknown>);
        }

        res.status(201).json({
          member: mapProfileRow(insertedProfile as Record<string, unknown>),
          ...(createdBio ? { biometric: sanitizeBiometricRow(createdBio) } : {}),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Reception / Staff: Update Member Profile
  app.patch(
    '/api/reception/members/:memberId',
    requireAuth,
    requireStaff,
    async (req: AuthedRequest, res, next) => {
      try {
        const {
          name,
          phone,
          membershipTier,
          discountPkr,
          discountReason,
          subscriptionEndDate,
          assignedTrainerId,
          emergencyContact,
          cnicLast4,
          membershipActive,
          staffNotes,
        } = req.body as {
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
        };

        const member = await getProfileById(req.params.memberId);
        if (!member || member.role !== 'member') {
          res.status(404).json({ error: 'Member profile not found.' });
          return;
        }

        const nextTier =
          membershipTier && TIER_FEES[membershipTier] ? membershipTier : member.membershipTier;
        const baseFee = TIER_FEES[nextTier] || member.baseMonthlyFeePkr || 7000;
        const nextDiscount =
          typeof discountPkr === 'number' && !Number.isNaN(discountPkr)
            ? Math.min(baseFee, Math.max(0, Math.round(discountPkr)))
            : member.discountPkr || 0;
        const nextFee = Math.max(0, baseFee - nextDiscount);

        const patch: Record<string, unknown> = {
          membership_tier: nextTier,
          base_monthly_fee_pkr: baseFee,
          discount_pkr: nextDiscount,
          monthly_fee_pkr: nextFee,
        };
        if (name?.trim()) patch.name = name.trim();
        if (phone?.trim()) patch.phone = phone.trim();
        if (typeof discountReason === 'string') patch.discount_reason = discountReason.trim();
        if (typeof subscriptionEndDate === 'string' && subscriptionEndDate.trim()) {
          patch.subscription_end_date = subscriptionEndDate.trim();
        }
        if (typeof assignedTrainerId === 'string') {
          patch.assigned_trainer_id = assignedTrainerId.trim() || null;
        }
        if (typeof emergencyContact === 'string') patch.emergency_contact = emergencyContact.trim();
        if (typeof cnicLast4 === 'string') {
          patch.cnic_last4 = cnicLast4.replace(/\D/g, '').slice(-4);
        }
        if (typeof membershipActive === 'boolean') patch.membership_active = membershipActive;
        if (typeof staffNotes === 'string') patch.staff_notes = staffNotes.trim();

        const supabase = getSupabaseAdmin();
        const { data: updated, error } = await supabase
          .from('profiles')
          .update(patch)
          .eq('id', member.id)
          .select('*')
          .single();

        if (error) throw new Error(error.message);
        res.json({ member: mapProfileRow(updated as Record<string, unknown>) });
      } catch (err) {
        next(err);
      }
    }
  );

  // Reception / Staff: Resolve or Dismiss a Member Forgot-Password Request
  app.post(
    '/api/reception/password-resets/:requestId/resolve',
    requireAuth,
    requireStaff,
    async (req: AuthedRequest, res, next) => {
      try {
        const { action, newPassword, resolutionNote } = req.body as {
          action?: 'reset' | 'dismiss';
          newPassword?: string;
          resolutionNote?: string;
        };

        if (action !== 'reset' && action !== 'dismiss') {
          res.status(400).json({ error: 'Action must be reset or dismiss.' });
          return;
        }

        const supabase = getSupabaseAdmin();
        const { data: resetRow, error: resetErr } = await supabase
          .from('password_reset_requests')
          .select('*')
          .eq('id', req.params.requestId)
          .maybeSingle();

        if (resetErr) throw new Error(resetErr.message);
        if (!resetRow) {
          res.status(404).json({ error: 'Password reset request not found.' });
          return;
        }

        const resetReq = mapPasswordResetRow(resetRow as Record<string, unknown>);
        const now = new Date().toISOString();

        if (action === 'dismiss') {
          const { data: dismissed, error: disErr } = await supabase
            .from('password_reset_requests')
            .update({
              status: 'Dismissed',
              resolved_at: now,
              resolved_by: req.authUser!.name,
              resolution_note: resolutionNote?.trim() || 'Dismissed by reception desk.',
            })
            .eq('id', resetReq.id)
            .select('*')
            .single();

          if (disErr) throw new Error(disErr.message);
          res.json({ request: mapPasswordResetRow(dismissed as Record<string, unknown>) });
          return;
        }

        const member = await getProfileById(resetReq.memberId);
        if (!member || member.role !== 'member') {
          res.status(404).json({ error: 'Linked member profile not found.' });
          return;
        }

        const candidate = newPassword?.trim() || '';
        if (candidate && candidate.length < 6) {
          res.status(400).json({ error: 'Temporary password must be at least 6 characters.' });
          return;
        }

        const temporaryPassword = candidate || createTemporaryPassword();
        const { error: authUpdErr } = await supabase.auth.admin.updateUserById(member.id, {
          password: temporaryPassword,
        });
        if (authUpdErr) throw new Error(authUpdErr.message);

        const { data: updatedReq, error: reqUpdErr } = await supabase
          .from('password_reset_requests')
          .update({
            status: 'Completed',
            resolved_at: now,
            resolved_by: req.authUser!.name,
            resolution_note:
              resolutionNote?.trim() || 'Temporary password generated and issued by reception.',
          })
          .eq('id', resetReq.id)
          .select('*')
          .single();

        if (reqUpdErr) throw new Error(reqUpdErr.message);

        res.json({
          request: mapPasswordResetRow(updatedReq as Record<string, unknown>),
          temporaryPassword,
          whatsappDeepLink: buildPasswordResetWhatsAppLink(member, temporaryPassword),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Reception / Staff: Proactively Initiate Password Reset for Any Member
  app.post(
    '/api/reception/members/:memberId/reset-password',
    requireAuth,
    requireStaff,
    async (req: AuthedRequest, res, next) => {
      try {
        const { newPassword, resolutionNote } = req.body as {
          newPassword?: string;
          resolutionNote?: string;
        };

        const member = await getProfileById(req.params.memberId);
        if (!member || member.role !== 'member') {
          res.status(404).json({ error: 'Member not found.' });
          return;
        }

        const candidate = newPassword?.trim() || '';
        if (candidate && candidate.length < 6) {
          res.status(400).json({ error: 'Temporary password must be at least 6 characters.' });
          return;
        }

        const supabase = getSupabaseAdmin();
        const temporaryPassword = candidate || createTemporaryPassword();
        const { error: authUpdErr } = await supabase.auth.admin.updateUserById(member.id, {
          password: temporaryPassword,
        });
        if (authUpdErr) throw new Error(authUpdErr.message);

        const now = new Date().toISOString();
        const { data: pendingRow } = await supabase
          .from('password_reset_requests')
          .select('*')
          .eq('member_id', member.id)
          .eq('status', 'Pending')
          .maybeSingle();

        let savedRequest;
        if (pendingRow) {
          const { data: updated, error: updErr } = await supabase
            .from('password_reset_requests')
            .update({
              status: 'Completed',
              resolved_at: now,
              resolved_by: req.authUser!.name,
              resolution_note:
                resolutionNote?.trim() || 'Password reset initiated by reception desk.',
            })
            .eq('id', pendingRow.id)
            .select('*')
            .single();
          if (updErr) throw new Error(updErr.message);
          savedRequest = mapPasswordResetRow(updated as Record<string, unknown>);
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from('password_reset_requests')
            .insert({
              id: `pwr-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
              member_id: member.id,
              member_code: member.memberCode,
              member_name: member.name,
              email: member.email,
              phone_provided: member.phone,
              registered_phone: member.phone,
              note: resolutionNote?.trim() || 'Staff-initiated member password reset.',
              status: 'Completed',
              trigger_source: 'Reception Initiated',
              requested_at: now,
              resolved_at: now,
              resolved_by: req.authUser!.name,
              resolution_note:
                resolutionNote?.trim() || 'Temporary password issued directly by reception.',
            })
            .select('*')
            .single();
          if (insErr) throw new Error(insErr.message);
          savedRequest = mapPasswordResetRow(inserted as Record<string, unknown>);
        }

        res.json({
          member,
          request: savedRequest,
          temporaryPassword,
          whatsappDeepLink: buildPasswordResetWhatsAppLink(member, temporaryPassword),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Reception / Staff: Enroll or Re-enroll Fingerprint Template
  app.post(
    '/api/reception/biometric/enroll',
    requireAuth,
    requireStaff,
    async (req: AuthedRequest, res, next) => {
      try {
        const {
          memberId,
          sensorVendor,
          fingerLabel,
          rawSignal,
          qualityScore,
          hardwareSerial,
          captureProtocol,
          templateFormat,
          credentialId,
        } = req.body as {
          memberId?: string;
          sensorVendor?: BiometricVendor;
          fingerLabel?: 'Right Index' | 'Right Thumb' | 'Left Index' | 'Left Thumb';
          rawSignal?: string;
          qualityScore?: number;
          hardwareSerial?: string;
          captureProtocol?: BiometricCaptureProtocol;
          templateFormat?: BiometricTemplateFormat;
          credentialId?: string;
        };

        if (!memberId) {
          res.status(400).json({ error: 'Member selection is required.' });
          return;
        }

        if (!isValidHardwareBiometricSignal(rawSignal, credentialId)) {
          res.status(400).json({
            error:
              'Live fingerprint capture from physical scanner hardware is required. Connect Local SDK Bridge, WebUSB optical reader, or WebAuthn biometric sensor.',
          });
          return;
        }

        const member = await getProfileById(memberId);
        if (!member || member.role !== 'member') {
          res.status(404).json({ error: 'Member not found.' });
          return;
        }

        const supabase = getSupabaseAdmin();
        const tokenSource = (rawSignal || credentialId || '').trim();
        const templateHash = hashBiometricSignal(tokenSource);
        const now = new Date().toISOString();
        const vendor: BiometricVendor = sensorVendor || 'ZKTeco SLK20R';
        const finger = fingerLabel || 'Right Index';
        const quality =
          typeof qualityScore === 'number' ? Math.min(100, Math.max(50, qualityScore)) : 95;

        const { data: existing } = await supabase
          .from('biometric_profiles')
          .select('*')
          .eq('member_id', member.id)
          .maybeSingle();

        let savedBioRow;
        if (existing) {
          const { data: updatedBio, error: updErr } = await supabase
            .from('biometric_profiles')
            .update({
              sensor_vendor: vendor,
              finger_label: finger,
              enrollment_status: 'Enrolled',
              quality_score: quality,
              enrolled_at: now,
              enrolled_by: req.authUser!.name,
              template_hash: templateHash,
              hardware_serial: hardwareSerial?.trim() || existing.hardware_serial || null,
              capture_protocol: captureProtocol || 'Local SDK Bridge',
              template_format: templateFormat || 'ISO-19794-2',
              credential_id: credentialId?.trim() || existing.credential_id || null,
            })
            .eq('member_id', member.id)
            .select('*')
            .single();
          if (updErr) throw new Error(updErr.message);
          savedBioRow = mapBiometricRow(updatedBio as Record<string, unknown>);
        } else {
          const { data: insertedBio, error: insErr } = await supabase
            .from('biometric_profiles')
            .insert({
              id: `bio-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
              member_id: member.id,
              member_code: member.memberCode,
              sensor_vendor: vendor,
              finger_label: finger,
              enrollment_status: 'Enrolled',
              quality_score: quality,
              enrolled_at: now,
              enrolled_by: req.authUser!.name,
              template_hash: templateHash,
              hardware_serial: hardwareSerial?.trim() || null,
              capture_protocol: captureProtocol || 'Local SDK Bridge',
              template_format: templateFormat || 'ISO-19794-2',
              credential_id: credentialId?.trim() || null,
            })
            .select('*')
            .single();
          if (insErr) throw new Error(insErr.message);
          savedBioRow = mapBiometricRow(insertedBio as Record<string, unknown>);
        }

        const { data: updatedProf, error: profErr } = await supabase
          .from('profiles')
          .update({
            biometric_status: 'Enrolled',
            biometric_finger_label: finger,
          })
          .eq('id', member.id)
          .select('*')
          .single();

        if (profErr) throw new Error(profErr.message);

        res.status(201).json({
          biometric: sanitizeBiometricRow(savedBioRow),
          member: mapProfileRow(updatedProf as Record<string, unknown>),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Reception / Staff: Suspend or Reactivate Biometric Template
  app.patch(
    '/api/reception/biometric/:memberId/status',
    requireAuth,
    requireStaff,
    async (req, res, next) => {
      try {
        const { enrollmentStatus } = req.body as {
          enrollmentStatus?: BiometricEnrollmentStatus;
        };
        if (
          enrollmentStatus !== 'Enrolled' &&
          enrollmentStatus !== 'Suspended' &&
          enrollmentStatus !== 'Not Enrolled'
        ) {
          res.status(400).json({ error: 'Invalid biometric enrollment status.' });
          return;
        }

        const supabase = getSupabaseAdmin();
        const [{ data: updatedBio, error: bioErr }, { data: updatedMember, error: memErr }] =
          await Promise.all([
            supabase
              .from('biometric_profiles')
              .update({ enrollment_status: enrollmentStatus })
              .eq('member_id', req.params.memberId)
              .select('*')
              .maybeSingle(),
            supabase
              .from('profiles')
              .update({ biometric_status: enrollmentStatus })
              .eq('id', req.params.memberId)
              .eq('role', 'member')
              .select('*')
              .maybeSingle(),
          ]);

        if (bioErr) throw new Error(bioErr.message);
        if (memErr) throw new Error(memErr.message);
        if (!updatedBio || !updatedMember) {
          res.status(404).json({ error: 'Biometric profile not found.' });
          return;
        }

        res.json({
          biometric: sanitizeBiometricRow(mapBiometricRow(updatedBio as Record<string, unknown>)),
          member: mapProfileRow(updatedMember as Record<string, unknown>),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  async function executeHardwareBiometricVerification(params: {
    rawSignal?: string;
    credentialId?: string;
    deviceName?: string;
    hardwareSerial?: string;
    captureProtocol?: BiometricCaptureProtocol;
    zoneOrClass?: string;
    matchConfidence?: number;
    operatorName: string;
  }) {
    const {
      rawSignal,
      credentialId,
      deviceName,
      hardwareSerial,
      captureProtocol,
      zoneOrClass,
      matchConfidence,
      operatorName,
    } = params;

    if (!isValidHardwareBiometricSignal(rawSignal, credentialId)) {
      return {
        status: 400 as const,
        error:
          'No valid hardware fingerprint template received. Place finger on the physical scanner to capture a live biometric signal.',
      };
    }

    const supabase = getSupabaseAdmin();
    let bioRowRaw: Record<string, unknown> | null = null;

    if (credentialId && credentialId.trim().length >= 16) {
      const { data } = await supabase
        .from('biometric_profiles')
        .select('*')
        .eq('credential_id', credentialId.trim())
        .maybeSingle();
      if (data) bioRowRaw = data as Record<string, unknown>;
    }
    if (!bioRowRaw && rawSignal && rawSignal.trim().length >= 16) {
      const candidateHash = hashBiometricSignal(rawSignal.trim());
      const { data } = await supabase
        .from('biometric_profiles')
        .select('*')
        .eq('template_hash', candidateHash)
        .maybeSingle();
      if (data) bioRowRaw = data as Record<string, unknown>;
    }

    if (!bioRowRaw) {
      return {
        status: 404 as const,
        error:
          'Fingerprint template did not match any enrolled member. Enroll the member using live hardware capture first.',
      };
    }

    const bioMatch = mapBiometricRow(bioRowRaw);

    if (bioMatch.enrollmentStatus !== 'Enrolled') {
      return {
        status: 403 as const,
        error: `Biometric access is currently ${bioMatch.enrollmentStatus} for ${bioMatch.memberCode}.`,
      };
    }

    const member = await getProfileById(bioMatch.memberId);
    if (!member) {
      return { status: 404 as const, error: 'Linked member profile not found.' };
    }

    if (isMembershipExpired(member)) {
      return {
        status: 403 as const,
        error: 'Membership Expired.',
      };
    }

    const now = new Date().toISOString();
    await supabase
      .from('biometric_profiles')
      .update({ last_matched_at: now })
      .eq('id', bioMatch.id);
    bioMatch.lastMatchedAt = now;

    const confidence =
      typeof matchConfidence === 'number'
        ? Number(Math.min(99.9, Math.max(85, matchConfidence)).toFixed(1))
        : 99.1;

    const { data: pendingRows } = await supabase
      .from('payment_submissions')
      .select('*')
      .eq('member_id', member.id)
      .eq('status', 'Pending')
      .order('submitted_at', { ascending: false });

    const pendingPayments = (pendingRows || []).map((r) =>
      mapPaymentRow(r as Record<string, unknown>)
    );

    let accessOutcome: 'Granted' | 'Granted with Due Alert' | 'Hold - Overdue' = 'Granted';
    let alertLevel: 'clear' | 'pending_review' | 'overdue' = 'clear';
    let alertMessage = `Monthly fee is Paid through ${member.feePaidThrough}. Floor access cleared.`;

    if (member.feeStatus === 'Pending Verification') {
      accessOutcome = 'Granted with Due Alert';
      alertLevel = 'pending_review';
      alertMessage =
        pendingPayments.length > 0
          ? `${pendingPayments[0].method} slip (${pendingPayments[0].transactionRef}) awaiting staff verification.`
          : 'Monthly fee is marked Pending Verification.';
    } else if (member.feeStatus === 'Overdue') {
      accessOutcome = 'Hold - Overdue';
      alertLevel = 'overdue';
      alertMessage = `Monthly fee of PKR ${member.monthlyFeePkr.toLocaleString('en-PK')} is Overdue (last paid: ${member.feePaidThrough}).`;
    }

    const serialSuffix = hardwareSerial?.trim() || bioMatch.hardwareSerial;
    const baseDevice = deviceName?.trim() || bioMatch.sensorVendor;
    const protocolTag = captureProtocol || bioMatch.captureProtocol || 'Hardware Reader';
    const resolvedDevice = serialSuffix ? `${baseDevice} · ${serialSuffix}` : baseDevice;

    const { data: attInserted, error: attErr } = await supabase
      .from('attendance_logs')
      .insert({
        id: `att-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        member_id: member.id,
        member_name: member.name,
        member_code: member.memberCode,
        check_in_time: now,
        zone_or_class: zoneOrClass?.trim() || 'Main Turnstile Entry',
        verified_by: `${operatorName} · ${protocolTag}`,
        verification_source: 'Biometric Scanner',
        device_name: resolvedDevice,
        match_confidence: confidence,
        fee_status_at_check_in: member.feeStatus,
        access_outcome: accessOutcome,
      })
      .select('*')
      .single();

    if (attErr) throw new Error(attErr.message);

    const { data: recentRows } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('member_id', member.id)
      .order('check_in_time', { ascending: false })
      .limit(6);

    const attendanceEntry = mapAttendanceRow(attInserted as Record<string, unknown>);
    const recentLogs = (recentRows || []).map((r) =>
      mapAttendanceRow(r as Record<string, unknown>)
    );

    const payload = {
      matched: true,
      member,
      biometric: sanitizeBiometricRow(bioMatch),
      attendanceEntry,
      pendingPayments,
      recentLogs,
      alertLevel,
      alertMessage,
    };

    biometricEventBus.emit('scan-verified', payload);
    return { status: 201 as const, payload };
  }

  // Reception / Staff: Real-Time Fingerprint Verification
  app.post(
    '/api/reception/biometric/verify',
    requireAuth,
    requireStaff,
    async (req: AuthedRequest, res, next) => {
      try {
        const {
          rawSignal,
          credentialId,
          deviceName,
          hardwareSerial,
          captureProtocol,
          zoneOrClass,
          matchConfidence,
        } = req.body as {
          rawSignal?: string;
          credentialId?: string;
          deviceName?: string;
          hardwareSerial?: string;
          captureProtocol?: BiometricCaptureProtocol;
          zoneOrClass?: string;
          matchConfidence?: number;
        };

        const outcome = await executeHardwareBiometricVerification({
          rawSignal,
          credentialId,
          deviceName,
          hardwareSerial,
          captureProtocol,
          zoneOrClass,
          matchConfidence,
          operatorName: req.authUser!.name,
        });

        if ('error' in outcome) {
          res.status(outcome.status).json({ error: outcome.error });
          return;
        }

        res.status(201).json(outcome.payload);
      } catch (err) {
        next(err);
      }
    }
  );

  // Local Hardware Daemon Webhook
  app.post('/api/reception/biometric/hardware-push', async (req, res, next) => {
    try {
      const configuredKey = process.env.HARDWARE_AGENT_KEY;
      const providedKey = req.header('X-Hardware-Agent-Key');
      const authHeader = req.header('Authorization');

      let operatorName = 'Hardware Terminal Daemon';
      let authorized = false;

      if (configuredKey && providedKey && providedKey === configuredKey) {
        authorized = true;
      } else if (authHeader?.startsWith('Bearer ')) {
        try {
          const user = await resolveUserFromToken(authHeader.slice(7).trim());
          if (user && (user.role === 'reception' || user.role === 'admin')) {
            authorized = true;
            operatorName = user.name;
          }
        } catch {
          authorized = false;
        }
      }

      if (!authorized) {
        res.status(401).json({ error: 'Unauthorized hardware terminal push.' });
        return;
      }

      const { rawSignal, credentialId, deviceName, hardwareSerial, zoneOrClass, matchConfidence } =
        req.body as {
          rawSignal?: string;
          credentialId?: string;
          deviceName?: string;
          hardwareSerial?: string;
          zoneOrClass?: string;
          matchConfidence?: number;
        };

      const outcome = await executeHardwareBiometricVerification({
        rawSignal,
        credentialId,
        deviceName,
        hardwareSerial,
        captureProtocol: 'Local SDK Bridge',
        zoneOrClass,
        matchConfidence,
        operatorName,
      });

      if ('error' in outcome) {
        res.status(outcome.status).json({ error: outcome.error });
        return;
      }

      res.status(201).json(outcome.payload);
    } catch (err) {
      next(err);
    }
  });

  // Live SSE Stream for real-time push scan events
  app.get('/api/reception/biometric/stream', async (req, res) => {
    const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
    const bearer = req.header('Authorization')?.replace(/^Bearer\s+/i, '') || queryToken;
    if (!bearer) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const user = await resolveUserFromToken(bearer);
      if (!user) {
        res.status(401).json({ error: 'Invalid session token.' });
        return;
      }
      if (user.role !== 'reception' && user.role !== 'admin') {
        res.status(403).json({ error: 'Staff clearance required.' });
        return;
      }
    } catch {
      res.status(401).json({ error: 'Invalid session token.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const onVerified = (payload: unknown) => {
      res.write(`event: scan-verified\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    biometricEventBus.on('scan-verified', onVerified);
    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 20_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      biometricEventBus.off('scan-verified', onVerified);
    });
  });

  // Admin & Reception: Approve or Reject Payment Upload
  app.post(
    '/api/admin/payments/:paymentId/review',
    requireAuth,
    requireStaff,
    async (req: AuthedRequest, res, next) => {
      try {
        const { action, adminRemark } = req.body as {
          action?: 'approve' | 'reject';
          adminRemark?: string;
        };

        if (action !== 'approve' && action !== 'reject') {
          res.status(400).json({ error: 'Action must be approve or reject.' });
          return;
        }

        const supabase = getSupabaseAdmin();
        const { data: payRow, error: payFetchErr } = await supabase
          .from('payment_submissions')
          .select('*')
          .eq('id', req.params.paymentId)
          .maybeSingle();

        if (payFetchErr) throw new Error(payFetchErr.message);
        if (!payRow) {
          res.status(404).json({ error: 'Payment submission not found.' });
          return;
        }

        const payment = mapPaymentRow(payRow as Record<string, unknown>);
        const remarkText =
          adminRemark?.trim() ||
          (action === 'approve'
            ? 'Payment verified and credited.'
            : 'Transaction ID could not be matched. Please re-upload clear receipt.');

        const { data: updatedPay, error: payUpdErr } = await supabase
          .from('payment_submissions')
          .update({
            status: action === 'approve' ? 'Approved' : 'Rejected',
            reviewed_at: new Date().toISOString(),
            reviewed_by: req.authUser!.name,
            admin_remark: remarkText,
          })
          .eq('id', payment.id)
          .select('*')
          .single();

        if (payUpdErr) throw new Error(payUpdErr.message);

        const member = await getProfileById(payment.memberId);
        if (member) {
          if (action === 'approve') {
            const today = new Date().toISOString().slice(0, 10);
            const anchor =
              member.subscriptionEndDate && member.subscriptionEndDate > today
                ? member.subscriptionEndDate
                : today;
            const nextEnd = addDaysIso(anchor, TIER_DURATION_DAYS[member.membershipTier] || 30);

            await supabase
              .from('profiles')
              .update({
                fee_status: 'Paid',
                fee_paid_through: payment.billingMonth,
                subscription_end_date: nextEnd,
                membership_active: true,
              })
              .eq('id', member.id);
          } else {
            await supabase
              .from('profiles')
              .update({ fee_status: 'Overdue' })
              .eq('id', member.id);
          }
        }

        res.json({ payment: mapPaymentRow(updatedPay as Record<string, unknown>) });
      } catch (err) {
        next(err);
      }
    }
  );

  // Admin & Reception: Manual Fee Status / Cash Verification Override
  app.post(
    '/api/admin/members/:memberId/fee-status',
    requireAuth,
    requireStaff,
    async (req: AuthedRequest, res, next) => {
      try {
        const { feeStatus, recordCashPayment, paymentMethod, transactionRef } = req.body as {
          feeStatus?: 'Paid' | 'Pending Verification' | 'Overdue';
          recordCashPayment?: boolean;
          paymentMethod?: PaymentMethod;
          transactionRef?: string;
        };

        const member = await getProfileById(req.params.memberId);
        if (!member || member.role !== 'member') {
          res.status(404).json({ error: 'Member not found.' });
          return;
        }

        const supabase = getSupabaseAdmin();
        const currentMonth = new Date().toISOString().slice(0, 7);
        const today = new Date().toISOString().slice(0, 10);

        if (recordCashPayment) {
          const method: PaymentMethod = paymentMethod || 'Cash';
          const anchor =
            member.subscriptionEndDate && member.subscriptionEndDate > today
              ? member.subscriptionEndDate
              : today;
          const nextEnd = addDaysIso(anchor, TIER_DURATION_DAYS[member.membershipTier] || 30);
          const now = new Date().toISOString();

          await supabase.from('payment_submissions').insert({
            id: `pay-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
            member_id: member.id,
            member_name: member.name,
            member_code: member.memberCode,
            membership_tier: member.membershipTier,
            billing_month: currentMonth,
            amount_pkr: member.monthlyFeePkr,
            method,
            transaction_ref:
              transactionRef?.trim() ||
              `${method === 'Cash' ? 'CASH-DESK' : 'DESK-REF'}-${Date.now().toString().slice(-6)}`,
            receipt_url: null,
            receipt_file_name: null,
            notes: `Recorded at Reception/Admin Desk by ${req.authUser!.name}.`,
            status: 'Approved',
            submitted_at: now,
            reviewed_at: now,
            reviewed_by: req.authUser!.name,
            admin_remark: 'Verified directly at FitBase Reception Desk.',
          });

          const { data: updatedProf, error: profErr } = await supabase
            .from('profiles')
            .update({
              fee_status: 'Paid',
              fee_paid_through: currentMonth,
              subscription_end_date: nextEnd,
              membership_active: true,
            })
            .eq('id', member.id)
            .select('*')
            .single();

          if (profErr) throw new Error(profErr.message);
          res.json({ member: mapProfileRow(updatedProf as Record<string, unknown>) });
          return;
        }

        if (feeStatus) {
          const patch: Record<string, unknown> = { fee_status: feeStatus };
          if (feeStatus === 'Paid') {
            patch.fee_paid_through = currentMonth;
          }
          const { data: updatedProf, error: profErr } = await supabase
            .from('profiles')
            .update(patch)
            .eq('id', member.id)
            .select('*')
            .single();

          if (profErr) throw new Error(profErr.message);
          res.json({ member: mapProfileRow(updatedProf as Record<string, unknown>) });
          return;
        }

        res.json({ member });
      } catch (err) {
        next(err);
      }
    }
  );

  // Staff: Run Daily Subscription Expiration Sweep & Dispatch WhatsApp Reminders
  app.post(
    '/api/staff/notifications/run-sweep',
    requireAuth,
    requireStaff,
    async (_req, res, next) => {
      try {
        const result = await runExpirationSweep('Manual Run');
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // Staff: Send Individual WhatsApp Renewal Reminder
  app.post(
    '/api/staff/notifications/send/:memberId',
    requireAuth,
    requireStaff,
    async (req, res, next) => {
      try {
        const member = await getProfileById(req.params.memberId);
        if (!member || member.role !== 'member') {
          res.status(404).json({ error: 'Member not found.' });
          return;
        }

        const settings = await getNotificationSettings();
        const endDate = member.subscriptionEndDate || addDaysIso(member.joinDate, 30);
        const daysRemaining = computeDaysRemaining(endDate);
        const log = await dispatchWhatsAppReminder(member, daysRemaining, 'Manual Run', settings);
        res.status(201).json({ log, whatsappDeepLink: log.whatsappDeepLink || '' });
      } catch (err) {
        next(err);
      }
    }
  );

  // Staff: Update Daily Cron & WhatsApp Notification Settings
  app.patch(
    '/api/staff/notifications/settings',
    requireAuth,
    requireStaff,
    async (req, res, next) => {
      try {
        const { reminderDaysBefore, dailyCronTime, whatsappEnabled } = req.body as {
          reminderDaysBefore?: number;
          dailyCronTime?: string;
          whatsappEnabled?: boolean;
        };

        const current = await getNotificationSettings();
        const nextReminder =
          typeof reminderDaysBefore === 'number' && !Number.isNaN(reminderDaysBefore)
            ? Math.min(30, Math.max(1, Math.round(reminderDaysBefore)))
            : current.reminderDaysBefore;
        const nextCron =
          typeof dailyCronTime === 'string' && /^\d{2}:\d{2}$/.test(dailyCronTime.trim())
            ? dailyCronTime.trim()
            : current.dailyCronTime;
        const nextWa =
          typeof whatsappEnabled === 'boolean' ? whatsappEnabled : current.whatsappEnabled;

        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('notification_settings')
          .upsert({
            id: 1,
            reminder_days_before: nextReminder,
            daily_cron_time: nextCron,
            whatsapp_enabled: nextWa,
            last_sweep_at: current.lastSweepAt,
            last_sweep_matched_count: current.lastSweepMatchedCount,
          })
          .select('*')
          .single();

        if (error) throw new Error(error.message);
        res.json({ settings: mapNotificationSettingsRow(data as Record<string, unknown>) });
      } catch (err) {
        next(err);
      }
    }
  );

  // Admin & Reception: Log Member Check-in from Front Desk
  app.post(
    '/api/admin/members/:memberId/checkin',
    requireAuth,
    requireStaff,
    async (req: AuthedRequest, res, next) => {
      try {
        const member = await getProfileById(req.params.memberId);
        if (!member || member.role !== 'member') {
          res.status(404).json({ error: 'Member not found.' });
          return;
        }
        if (isMembershipExpired(member)) {
          res.status(403).json({ error: 'Membership Expired.' });
          return;
        }

        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('attendance_logs')
          .insert({
            id: `att-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
            member_id: member.id,
            member_name: member.name,
            member_code: member.memberCode,
            check_in_time: new Date().toISOString(),
            zone_or_class: 'Main Gym Floor',
            verified_by: `${req.authUser!.name} (Front Desk)`,
            verification_source: 'Front Desk Manual',
            fee_status_at_check_in: member.feeStatus,
            access_outcome:
              member.feeStatus === 'Paid'
                ? 'Granted'
                : member.feeStatus === 'Pending Verification'
                  ? 'Granted with Due Alert'
                  : 'Hold - Overdue',
          })
          .select('*')
          .single();

        if (error) throw new Error(error.message);
        res.status(201).json({ entry: mapAttendanceRow(data as Record<string, unknown>) });
      } catch (err) {
        next(err);
      }
    }
  );

  // Admin Portal: Create New Trainer
  app.post('/api/admin/trainers', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const body = req.body as Partial<TrainerInput>;
      if (!body.name?.trim() || !body.specialty?.trim()) {
        res.status(400).json({ error: 'Trainer name and specialty are required.' });
        return;
      }

      const validKeys: TrainerPortraitKey[] = [
        'coach_bilal',
        'coach_ayesha',
        'coach_zohaib',
        'coach_nadia',
        'default',
      ];
      const portraitKey: TrainerPortraitKey =
        body.portraitKey && validKeys.includes(body.portraitKey) ? body.portraitKey : 'default';

      const supabase = getSupabaseAdmin();
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('trainers')
        .insert({
          id: `trn-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
          name: body.name.trim(),
          specialty: body.specialty.trim(),
          certifications: body.certifications?.trim() || 'Certified FitBase Coach',
          experience_years: Math.max(0, Math.round(Number(body.experienceYears ?? 1))),
          portrait_key: portraitKey,
          portrait_url: body.portraitUrl?.trim() || null,
          active_clients: Math.max(0, Math.round(Number(body.activeClients ?? 0))),
          sessions_this_month: Math.max(0, Math.round(Number(body.sessionsThisMonth ?? 0))),
          attendance_completion_rate: Math.min(
            100,
            Math.max(0, Math.round(Number(body.attendanceCompletionRate ?? 100)))
          ),
          client_retention_rate: Math.min(
            100,
            Math.max(0, Math.round(Number(body.clientRetentionRate ?? 100)))
          ),
          rating: Number(Math.min(5, Math.max(1, Number(body.rating ?? 5.0))).toFixed(1)),
          bio: body.bio?.trim() || '',
          admin_review_note: body.adminReviewNote?.trim() || 'Added by FitBase Management.',
          last_evaluated_at: today,
        })
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      res.status(201).json({ trainer: mapTrainerRow(data as Record<string, unknown>) });
    } catch (err) {
      next(err);
    }
  });

  // Admin Portal: Update Trainer Profile & Performance Evaluation
  app.patch(
    '/api/admin/trainers/:trainerId',
    requireAuth,
    requireAdmin,
    async (req, res, next) => {
      try {
        const body = req.body as Partial<TrainerInput>;
        const supabase = getSupabaseAdmin();

        const { data: existingRow, error: fetchErr } = await supabase
          .from('trainers')
          .select('*')
          .eq('id', req.params.trainerId)
          .maybeSingle();

        if (fetchErr) throw new Error(fetchErr.message);
        if (!existingRow) {
          res.status(404).json({ error: 'Trainer record not found.' });
          return;
        }

        const patch: Record<string, unknown> = {
          last_evaluated_at: new Date().toISOString().slice(0, 10),
        };

        if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
        if (typeof body.specialty === 'string' && body.specialty.trim()) {
          patch.specialty = body.specialty.trim();
        }
        if (typeof body.certifications === 'string') {
          patch.certifications = body.certifications.trim();
        }
        if (typeof body.experienceYears === 'number' && !Number.isNaN(body.experienceYears)) {
          patch.experience_years = Math.max(0, Math.round(body.experienceYears));
        }
        if (body.portraitKey) {
          patch.portrait_key = body.portraitKey;
        }
        if (body.portraitUrl !== undefined) {
          patch.portrait_url = body.portraitUrl?.trim() || null;
        }
        if (typeof body.activeClients === 'number' && !Number.isNaN(body.activeClients)) {
          patch.active_clients = Math.max(0, Math.round(body.activeClients));
        }
        if (typeof body.sessionsThisMonth === 'number' && !Number.isNaN(body.sessionsThisMonth)) {
          patch.sessions_this_month = Math.max(0, Math.round(body.sessionsThisMonth));
        }
        if (
          typeof body.attendanceCompletionRate === 'number' &&
          !Number.isNaN(body.attendanceCompletionRate)
        ) {
          patch.attendance_completion_rate = Math.min(
            100,
            Math.max(0, Math.round(body.attendanceCompletionRate))
          );
        }
        if (
          typeof body.clientRetentionRate === 'number' &&
          !Number.isNaN(body.clientRetentionRate)
        ) {
          patch.client_retention_rate = Math.min(
            100,
            Math.max(0, Math.round(body.clientRetentionRate))
          );
        }
        if (typeof body.rating === 'number' && !Number.isNaN(body.rating)) {
          patch.rating = Number(Math.min(5, Math.max(1, body.rating)).toFixed(1));
        }
        if (typeof body.bio === 'string') patch.bio = body.bio.trim();
        if (typeof body.adminReviewNote === 'string') {
          patch.admin_review_note = body.adminReviewNote.trim();
        }

        const { data: updated, error: updErr } = await supabase
          .from('trainers')
          .update(patch)
          .eq('id', req.params.trainerId)
          .select('*')
          .single();

        if (updErr) throw new Error(updErr.message);

        if (typeof patch.name === 'string') {
          await supabase
            .from('gym_classes')
            .update({ trainer_name: patch.name })
            .eq('trainer_id', req.params.trainerId);
        }

        res.json({ trainer: mapTrainerRow(updated as Record<string, unknown>) });
      } catch (err) {
        next(err);
      }
    }
  );

  // Admin Portal: Delete Trainer Record
  app.delete(
    '/api/admin/trainers/:trainerId',
    requireAuth,
    requireAdmin,
    async (req, res, next) => {
      try {
        const supabase = getSupabaseAdmin();
        const { data: deleted, error } = await supabase
          .from('trainers')
          .delete()
          .eq('id', req.params.trainerId)
          .select('id');

        if (error) throw new Error(error.message);
        if (!deleted || deleted.length === 0) {
          res.status(404).json({ error: 'Trainer record not found.' });
          return;
        }
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  // Admin Portal: Review & Reply to Feedback
  app.patch(
    '/api/admin/feedback/:feedbackId',
    requireAuth,
    requireAdmin,
    async (req, res, next) => {
      try {
        const { status, adminReply } = req.body as {
          status?: 'Open' | 'In Review' | 'Resolved';
          adminReply?: string;
        };

        const patch: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (status === 'Open' || status === 'In Review' || status === 'Resolved') {
          patch.status = status;
        }
        if (typeof adminReply === 'string') {
          patch.admin_reply = adminReply.trim();
        }

        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('feedback_entries')
          .update(patch)
          .eq('id', req.params.feedbackId)
          .select('*')
          .maybeSingle();

        if (error) throw new Error(error.message);
        if (!data) {
          res.status(404).json({ error: 'Feedback record not found.' });
          return;
        }

        res.json({ entry: mapFeedbackRow(data as Record<string, unknown>) });
      } catch (err) {
        next(err);
      }
    }
  );

  // Handle errors cleanly (Supabase configuration errors -> 503)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SupabaseConfigError) {
      res.status(503).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Unexpected server error.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Daily Subscription Expiration & WhatsApp Notification Scheduler
  const checkDailyCron = async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const settings = await getNotificationSettings();
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const currentHm = now.toTimeString().slice(0, 5);
      const targetHm = settings.dailyCronTime || '08:00';
      const alreadySweptToday = settings.lastSweepAt?.startsWith(today);
      if (!alreadySweptToday && currentHm >= targetHm) {
        await runExpirationSweep('Daily Cron');
      }
    } catch {
      // Non-fatal background schedule tick
    }
  };
  void checkDailyCron();
  setInterval(() => {
    void checkDailyCron();
  }, 60_000);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FitBase Fitness Center server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

-- FitBase Fitness Center — Production Supabase PostgreSQL Schema
-- Run this SQL in your Supabase Project -> SQL Editor

create extension if not exists pgcrypto;

-- 1. Profiles (linked 1:1 to Supabase Auth users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  member_code text not null unique,
  name text not null,
  email text not null unique,
  phone text not null default '',
  role text not null default 'member' check (role in ('member', 'reception', 'admin')),
  membership_tier text not null default 'Official Package',
  base_monthly_fee_pkr integer not null default 7000,
  discount_pkr integer not null default 0,
  discount_reason text,
  monthly_fee_pkr integer not null default 7000,
  fee_status text not null default 'Overdue' check (fee_status in ('Paid', 'Pending Verification', 'Overdue')),
  fee_paid_through text not null default 'Unpaid',
  subscription_end_date date not null default (current_date + interval '30 days')::date,
  last_reminder_sent_at timestamptz,
  join_date date not null default current_date,
  assigned_trainer_id text,
  emergency_contact text,
  cnic_last4 text,
  membership_active boolean not null default true,
  biometric_status text not null default 'Not Enrolled' check (biometric_status in ('Enrolled', 'Not Enrolled', 'Suspended')),
  biometric_finger_label text,
  staff_notes text,
  created_at timestamptz not null default now()
);

-- 2. Trainers
create table if not exists public.trainers (
  id text primary key,
  name text not null,
  specialty text not null,
  certifications text not null default '',
  experience_years integer not null default 1,
  portrait_key text not null default 'default',
  portrait_url text,
  active_clients integer not null default 0,
  sessions_this_month integer not null default 0,
  attendance_completion_rate integer not null default 100,
  client_retention_rate integer not null default 100,
  rating numeric(3,1) not null default 5.0,
  bio text not null default '',
  admin_review_note text not null default '',
  last_evaluated_at date not null default current_date,
  created_at timestamptz not null default now()
);

-- 3. Gym Classes
create table if not exists public.gym_classes (
  id text primary key,
  title text not null,
  discipline text not null check (discipline in ('Strength', 'Conditioning', 'Olympic Lifting', 'Mobility', 'Boxing')),
  day_of_week text not null check (day_of_week in ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')),
  start_time text not null,
  duration_min integer not null default 45,
  trainer_id text references public.trainers(id) on delete set null,
  trainer_name text not null,
  zone text not null,
  intensity text not null default 'Moderate' check (intensity in ('Moderate', 'High', 'Max Effort')),
  capacity integer not null default 15,
  booked_member_ids jsonb not null default '[]'::jsonb,
  audience text check (audience in ('Co-Ed', 'Female Only')),
  slot_label text
);

-- 4. Biometric Hardware Profiles (stores HMAC-SHA256 template hashes only, never raw images)
create table if not exists public.biometric_profiles (
  id text primary key,
  member_id uuid not null unique references public.profiles(id) on delete cascade,
  member_code text not null,
  sensor_vendor text not null,
  finger_label text not null check (finger_label in ('Right Index', 'Right Thumb', 'Left Index', 'Left Thumb')),
  enrollment_status text not null default 'Enrolled' check (enrollment_status in ('Enrolled', 'Not Enrolled', 'Suspended')),
  quality_score integer not null default 95,
  enrolled_at timestamptz not null default now(),
  enrolled_by text not null,
  last_matched_at timestamptz,
  hardware_serial text,
  capture_protocol text,
  template_format text,
  credential_id text,
  template_hash text not null
);

-- 5. Member Performance Logs
create table if not exists public.performance_logs (
  id text primary key,
  member_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  metric text not null,
  category text not null check (category in ('Strength Lift', 'Conditioning', 'Body Composition')),
  value numeric not null,
  unit text not null,
  notes text not null default ''
);

-- 6. Member Goals
create table if not exists public.member_goals (
  id text primary key,
  member_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  metric text not null,
  start_value numeric not null default 0,
  current_value numeric not null default 0,
  target_value numeric not null,
  unit text not null,
  deadline date not null,
  status text not null default 'Active' check (status in ('Active', 'Achieved'))
);

-- 7. Attendance Logs
create table if not exists public.attendance_logs (
  id text primary key,
  member_id uuid not null references public.profiles(id) on delete cascade,
  member_name text not null,
  member_code text not null,
  check_in_time timestamptz not null default now(),
  zone_or_class text not null,
  verified_by text not null,
  verification_source text check (verification_source in ('Biometric Scanner', 'Front Desk Manual', 'Member Self Check-In')),
  device_name text,
  match_confidence numeric,
  fee_status_at_check_in text,
  access_outcome text
);

-- 8. Payment Submissions (JazzCash, EasyPaisa, Bank Transfer, Cash)
create table if not exists public.payment_submissions (
  id text primary key,
  member_id uuid not null references public.profiles(id) on delete cascade,
  member_name text not null,
  member_code text not null,
  membership_tier text not null,
  billing_month text not null,
  amount_pkr integer not null,
  method text not null check (method in ('JazzCash', 'EasyPaisa', 'Cash', 'Bank Transfer')),
  transaction_ref text not null,
  receipt_url text,
  receipt_file_name text,
  notes text not null default '',
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  admin_remark text
);

-- 9. Feedback Entries
create table if not exists public.feedback_entries (
  id text primary key,
  member_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  author_email text not null,
  category text not null check (category in ('Equipment', 'Trainer', 'Facility', 'Billing', 'General Inquiry')),
  trainer_id text references public.trainers(id) on delete set null,
  rating integer not null default 5,
  message text not null,
  status text not null default 'Open' check (status in ('Open', 'In Review', 'Resolved')),
  admin_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 10. Automated Notification Logs
create table if not exists public.notification_logs (
  id text primary key,
  member_id uuid not null references public.profiles(id) on delete cascade,
  member_name text not null,
  member_code text not null,
  phone text not null,
  channel text not null check (channel in ('WhatsApp', 'In-Portal')),
  provider text not null,
  days_remaining integer not null,
  subscription_end_date date not null,
  message_preview text not null,
  delivery_status text not null,
  provider_message_id text,
  whatsapp_deep_link text,
  dispatched_at timestamptz not null default now(),
  trigger_type text not null check (trigger_type in ('Daily Cron', 'Manual Run'))
);

-- 11. Notification Settings (singleton row id = 1)
create table if not exists public.notification_settings (
  id integer primary key default 1 check (id = 1),
  reminder_days_before integer not null default 5,
  daily_cron_time text not null default '08:00',
  whatsapp_enabled boolean not null default true,
  last_sweep_at timestamptz,
  last_sweep_matched_count integer not null default 0
);

insert into public.notification_settings (id, reminder_days_before, daily_cron_time, whatsapp_enabled)
values (1, 5, '08:00', true)
on conflict (id) do nothing;

-- 12. Password Reset Requests (Member Forgot Password -> Reception Portal)
create table if not exists public.password_reset_requests (
  id text primary key,
  member_id uuid not null references public.profiles(id) on delete cascade,
  member_code text not null,
  member_name text not null,
  email text not null,
  phone_provided text not null,
  registered_phone text not null,
  note text,
  status text not null default 'Pending' check (status in ('Pending', 'Completed', 'Dismissed')),
  trigger_source text not null default 'Member Forgot Password' check (trigger_source in ('Member Forgot Password', 'Reception Initiated')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text
);

-- Enable Row Level Security (Server routes use Service Role Key; RLS protects direct anon browser reads)
alter table public.profiles enable row level security;
alter table public.trainers enable row level security;
alter table public.gym_classes enable row level security;
alter table public.biometric_profiles enable row level security;
alter table public.performance_logs enable row level security;
alter table public.member_goals enable row level security;
alter table public.attendance_logs enable row level security;
alter table public.payment_submissions enable row level security;
alter table public.feedback_entries enable row level security;
alter table public.notification_logs enable row level security;
alter table public.notification_settings enable row level security;
alter table public.password_reset_requests enable row level security;

-- Public read access for homepage schedule and trainers
drop policy if exists "Public can read trainers" on public.trainers;
create policy "Public can read trainers" on public.trainers for select using (true);

drop policy if exists "Public can read gym classes" on public.gym_classes;
create policy "Public can read gym classes" on public.gym_classes for select using (true);

-- Authenticated users can read their own profile and logs directly if needed
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select using (auth.uid() = id);

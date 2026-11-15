import { CheckCircle2, Clock, AlertTriangle, XCircle } from 'lucide-react';
import { BRAND_LOGO_SRC } from '../media';
import type { FeeStatus, PaymentApprovalStatus } from '../types';

export function FitBaseLogo({
  size = 'sm',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dimensions =
    size === 'lg'
      ? 'h-24 w-24 rounded-2xl'
      : size === 'md'
        ? 'h-14 w-14 rounded-xl'
        : 'h-10 w-10 rounded-lg';

  return (
    <div
      className={`relative shrink-0 overflow-hidden border border-zinc-800 bg-[#0D0304] shadow-sm ${dimensions} ${className}`}
    >
      <img
        src={BRAND_LOGO_SRC}
        alt="FitBase Fitness Center Emblem"
        referrerPolicy="no-referrer"
        className="h-full w-full scale-[1.08] object-cover object-center gym-media-filter"
      />
    </div>
  );
}

export function BuiltByLink({
  className = '',
}: {
  className?: string;
  variant?: 'compact' | 'footer';
}) {
  return (
    <a
      href="https://masudcollection.com"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-block w-fit text-[11px] font-medium tracking-wide text-zinc-400 underline decoration-zinc-700/80 underline-offset-2 transition-colors hover:text-red-400 hover:decoration-red-500 ${className}`}
    >
      Built by AI Specialist SHAFFAN
    </a>
  );
}

export function BrandRoleCredits({
  className = '',
  variant = 'stacked',
}: {
  className?: string;
  variant?: 'stacked' | 'inline' | 'footer';
}) {
  if (variant === 'inline') {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 text-[10px] leading-tight text-zinc-400 ${className}`}>
        <a
          href="https://masudcollection.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-zinc-300 underline decoration-zinc-700/80 underline-offset-2 transition-colors hover:text-red-400 hover:decoration-red-500"
        >
          Built by AI Specialist SHAFFAN
        </a>
        <span aria-hidden="true" className="text-zinc-600">
          ·
        </span>
        <span>
          Owner: <strong className="font-semibold text-yellow-400">TAMHEED</strong>
        </span>
      </div>
    );
  }

  return (
    <div className={`space-y-0.5 text-[11px] leading-snug ${className}`}>
      <BuiltByLink variant={variant === 'footer' ? 'footer' : 'compact'} />
      <p className="text-zinc-300">
        Gym Owner: <span className="font-semibold text-yellow-400">TAMHEED</span>
      </p>
    </div>
  );
}

export function FeeStatusText({ status }: { status: FeeStatus }) {
  if (status === 'Paid') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span>Paid</span>
      </span>
    );
  }
  if (status === 'Pending Verification') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>Pending Verification</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>Overdue</span>
    </span>
  );
}

export function PaymentStatusText({ status }: { status: PaymentApprovalStatus }) {
  if (status === 'Approved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span>Approved</span>
      </span>
    );
  }
  if (status === 'Rejected') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400">
        <XCircle className="h-3.5 w-3.5 shrink-0" />
        <span>Rejected</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span>Pending Review</span>
    </span>
  );
}

export function formatPkr(amount: number): string {
  return `PKR ${amount.toLocaleString('en-PK')}`;
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

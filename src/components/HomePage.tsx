import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Expand,
  Fingerprint,
  Instagram,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { api } from '../api';
import {
  FACILITY_GALLERY,
  FACILITY_PHOTOS,
  getTrainerPortrait,
  MEDIA,
  type FacilityGalleryItem,
} from '../media';
import { BrandRoleCredits, FitBaseLogo, formatPkr } from './Brand';
import { FitBaseChatPanel, type useFitBaseChat } from './FitBaseChatbot';
import type { GymClass, MembershipTier, PortalTarget, TrainerRecord, UserProfile } from '../types';

interface HomePageProps {
  classes: GymClass[];
  trainers: TrainerRecord[];
  tiers: Record<MembershipTier, number>;
  currentUser: UserProfile | null;
  chat: ReturnType<typeof useFitBaseChat>;
  onOpenAuth: (
    mode?: 'login' | 'register',
    preselectedTier?: MembershipTier,
    targetPortal?: PortalTarget
  ) => void;
  onOpenPortal: (targetPortal?: PortalTarget) => void;
  onClassBookingUpdated: (updatedClasses: GymClass[]) => void;
}

const DAYS = ['All', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const DISCIPLINES = ['All', 'Strength', 'Conditioning', 'Olympic Lifting', 'Boxing', 'Mobility'] as const;

const GALLERY_FILTERS = ['All Areas', 'Free Weights', 'Machines & Cables', 'Cardio & Boxing', 'Amenities'] as const;

export function HomePage({
  classes,
  trainers,
  tiers,
  currentUser,
  chat,
  onOpenAuth,
  onOpenPortal,
  onClassBookingUpdated,
}: HomePageProps) {
  const [selectedDay, setSelectedDay] = useState<(typeof DAYS)[number]>('All');
  const [selectedDiscipline, setSelectedDiscipline] = useState<(typeof DISCIPLINES)[number]>('All');
  const [bookingBusyId, setBookingBusyId] = useState<string | null>(null);
  const [bookingNotice, setBookingNotice] = useState<string | null>(null);

  const [galleryFilter, setGalleryFilter] = useState<(typeof GALLERY_FILTERS)[number]>('All Areas');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const allShowcasePhotos = useMemo(
    () => [
      {
        id: 'hero-emblem',
        src: FACILITY_PHOTOS.goldEmblemFloor,
        title: 'FitBase Signature Emblem & Strength Hall',
        zone: 'Main Floor · Green Avenue',
        category: 'Machines & Cables' as const,
        caption: 'Custom illuminated gold FitBase shield overlooking the selectorized strength floor and recovery lounge.',
      },
      {
        id: 'zone-main-aisle',
        src: FACILITY_PHOTOS.mainAisle,
        title: 'Selectorized Strength & Cable Aisle',
        zone: '01. Strength Machine Bay',
        category: 'Machines & Cables' as const,
        caption: 'Central training corridor featuring commercial chest press, shoulder stack, and high-pulley towers.',
      },
      {
        id: 'zone-plate-bay',
        src: FACILITY_PHOTOS.plateRackBay,
        title: 'Free Weight & Plate-Loaded Bay',
        zone: '02. Plate & Barbell Zone',
        category: 'Free Weights' as const,
        caption: 'Calibrated plate trees, T-bar row, incline benches, and full dumbbell wall under architectural ceiling rings.',
      },
      {
        id: 'zone-cardio-deck',
        src: FACILITY_PHOTOS.cardioDeck,
        title: 'Cardio Deck & StairMaster Row',
        zone: '03. Conditioning Deck',
        category: 'Cardio & Boxing' as const,
        caption: 'Commercial treadmills, StairMaster stepmill, and elliptical stations facing Canal Road windows.',
      },
      {
        id: 'zone-boxing-turf',
        src: FACILITY_PHOTOS.boxingTurf,
        title: 'Boxing Heavy Bag & Turf Lane',
        zone: '04. Combat & Functional Turf',
        category: 'Cardio & Boxing' as const,
        caption: 'Suspended heavy boxing bag, live wall interval clock, and green shock-absorbing turf lane.',
      },
      ...FACILITY_GALLERY,
    ],
    []
  );

  const filteredGallery: FacilityGalleryItem[] = useMemo(() => {
    if (galleryFilter === 'All Areas') return FACILITY_GALLERY;
    return FACILITY_GALLERY.filter((item) => item.category === galleryFilter);
  }, [galleryFilter]);

  const openLightboxById = (id: string) => {
    const idx = allShowcasePhotos.findIndex((item) => item.id === id);
    if (idx !== -1) setLightboxIndex(idx);
  };

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev === null ? null : (prev + 1) % allShowcasePhotos.length));
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) =>
          prev === null ? null : (prev - 1 + allShowcasePhotos.length) % allShowcasePhotos.length
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, allShowcasePhotos.length]);

  const filteredClasses = useMemo(() => {
    return classes.filter((cls) => {
      const dayMatch = selectedDay === 'All' || cls.dayOfWeek === selectedDay;
      const discMatch = selectedDiscipline === 'All' || cls.discipline === selectedDiscipline;
      return dayMatch && discMatch;
    });
  }, [classes, selectedDay, selectedDiscipline]);

  const handleToggleBooking = async (classId: string) => {
    if (!currentUser) {
      onOpenAuth('login');
      return;
    }
    setBookingBusyId(classId);
    setBookingNotice(null);
    try {
      const res = await api.toggleClassBooking(classId);
      onClassBookingUpdated(res.classes);
      setBookingNotice(res.booked ? 'Spot reserved in your Member Portal.' : 'Class reservation cancelled.');
    } catch (err) {
      setBookingNotice(err instanceof Error ? err.message : 'Unable to update reservation.');
    } finally {
      setBookingBusyId(null);
    }
  };

  const membershipPlans: Array<{
    tier: MembershipTier;
    audience: string;
    billingLabel: string;
    badge?: string;
    price: number;
    featured?: boolean;
    features: string[];
  }> = [
    {
      tier: 'Student Package',
      audience: 'Must show valid Student ID',
      billingLabel: '/ month',
      price: tiers['Student Package'] || 6000,
      features: [
        'All facilities included (Gym + Cardio + AC)',
        'Two daily Ladies-Only classes included (11:30 AM & 3:00 PM)',
        'Executive changing rooms & lockers',
        'Member Portal progress & fee verification',
      ],
    },
    {
      tier: 'Official Package',
      audience: 'Standard monthly dues',
      billingLabel: '/ month',
      price: tiers['Official Package'] || 7000,
      features: [
        'All facilities included (Gym + Cardio + AC)',
        'Morning Co, Ladies Only, or Evening Co slot access',
        'Certified floor trainer guidance included',
        'JazzCash, EasyPaisa, Bank & Desk Cash verification',
      ],
    },
    {
      tier: '3 Months Package',
      audience: 'Quarterly commitment · Save PKR 5,000',
      billingLabel: 'total · 3 months',
      price: tiers['3 Months Package'] || 16000,
      features: [
        'All facilities included for 90 days',
        'Powerful air-conditioned floor throughout',
        'Biometric check-in & class spot booking',
        'Two daily female fitness classes free in package',
      ],
    },
    {
      tier: '6 Months Package',
      audience: 'Half-year plan · Save PKR 12,000',
      billingLabel: 'total · 6 months',
      badge: 'Best Value',
      featured: true,
      price: tiers['6 Months Package'] || 30000,
      features: [
        'All facilities included for 180 days',
        'Full access to free weights, cables & turf',
        'Executive changing rooms & hygienic floor',
        'Priority fee verification & WhatsApp alerts',
      ],
    },
    {
      tier: '12 Months Package',
      audience: 'Annual transformation · Save PKR 34,000',
      billingLabel: 'total · 12 months',
      badge: 'Best Deal',
      price: tiers['12 Months Package'] || 50000,
      features: [
        'All facilities included for 365 days',
        'Lowest monthly effective rate (PKR 4,167/mo)',
        'Unlimited group classes & biometric access',
        'Complete lift PR & goal tracking in Portal',
      ],
    },
  ];

  const femaleWeeklyClasses = [
    { day: 'Monday', workout: 'Upper Body Workout', status: 'Active' },
    { day: 'Tuesday', workout: 'Lower Body Workout', status: 'Active' },
    { day: 'Wednesday', workout: 'Full Body Workout (With Weights)', status: 'Active' },
    { day: 'Thursday', workout: 'Yoga Class', status: 'Active' },
    { day: 'Friday', workout: 'Off Day', status: 'Off' },
    { day: 'Saturday', workout: 'Stick / Stepper Class', status: 'Active' },
    { day: 'Sunday', workout: 'No Class', status: 'Off' },
  ] as const;

  return (
    <main id="top" className="bg-[#09090B]">
      {/* Hero Section */}
      <section className="border-b border-zinc-800/80">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
            <div className="flex flex-col justify-center gap-6 lg:col-span-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3.5">
                  <FitBaseLogo size="md" />
                  <div>
                    <p className="font-display text-2xl font-bold tracking-wide text-white leading-none">
                      FIT<span className="text-red-500">BASE</span>
                    </p>
                    <BrandRoleCredits className="mt-1" />
                    <div className="mt-1 text-xs font-medium tracking-wide text-zinc-400">
                      <span>Near Marhaba Mart, Green Avenue, East Canal Road, Faisalabad</span>
                      <span aria-hidden="true" className="mx-2 text-zinc-600">·</span>
                      <span>AC On. Excuses Off.</span>
                    </div>
                  </div>
                </div>

                <h1
                  className="font-display font-bold tracking-tight text-white"
                  style={{ fontSize: 'clamp(2.35rem, 4.3vw, 3.85rem)', lineHeight: 1.03 }}
                >
                  Built for Measurable Strength and Daily Discipline.
                </h1>

                <p className="max-w-xl text-sm sm:text-base leading-relaxed text-zinc-300">
                  FitBase Fitness Center delivers a fully air-conditioned training floor,
                  state-of-the-art equipment, dedicated Ladies-Only &amp; Co-Ed sessions, executive
                  changing rooms, and direct digital portals for Members, Reception Biometric Desk,
                  and Owner Operations.
                </p>
              </div>

              {/* Direct Upfront 3-Portal Access Grid */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Direct Portal Access — Select Your Workspace
                  </p>
                  <a
                    href="#schedule"
                    className="inline-flex items-center gap-1 text-xs font-medium text-zinc-300 hover:text-white underline underline-offset-4 decoration-zinc-700"
                  >
                    <Clock className="h-3.5 w-3.5 text-red-400" />
                    <span>Class Schedule</span>
                  </a>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {/* Member Portal Card */}
                  <button
                    type="button"
                    onClick={() => onOpenPortal('member')}
                    className="group flex flex-col justify-between rounded-xl border border-red-500/40 bg-gradient-to-b from-red-600/20 to-[#111114] p-3.5 text-left transition-colors hover:border-red-500 hover:from-red-600/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white">
                          <UserCheck className="h-4 w-4" />
                        </span>
                        <ArrowRight className="h-4 w-4 text-red-400 transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <h2 className="mt-2.5 font-display text-lg font-bold text-white leading-tight">
                        Member Portal
                      </h2>
                      <p className="mt-1 text-[11px] leading-snug text-zinc-300">
                        Workouts, goals, fee slips &amp; forgot password reset
                      </p>
                    </div>
                    <span className="mt-3 inline-flex items-center text-[11px] font-semibold text-red-400">
                      {currentUser?.role === 'member' ? 'Open My Dashboard' : 'Member Login / Join'}
                    </span>
                  </button>

                  {/* Reception Portal Card */}
                  <button
                    type="button"
                    onClick={() => onOpenPortal('reception')}
                    className="group flex flex-col justify-between rounded-xl border border-amber-500/40 bg-gradient-to-b from-amber-500/15 to-[#111114] p-3.5 text-left transition-colors hover:border-amber-400 hover:from-amber-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-zinc-950">
                          <Fingerprint className="h-4 w-4" />
                        </span>
                        <ArrowRight className="h-4 w-4 text-amber-400 transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <h2 className="mt-2.5 font-display text-lg font-bold text-white leading-tight">
                        Reception Portal
                      </h2>
                      <p className="mt-1 text-[11px] leading-snug text-zinc-300">
                        Biometric scanner check-in, dues &amp; password resets
                      </p>
                    </div>
                    <span className="mt-3 inline-flex items-center text-[11px] font-semibold text-amber-400">
                      {currentUser?.role === 'reception'
                        ? 'Open Reception Desk'
                        : 'Staff Desk Login'}
                    </span>
                  </button>

                  {/* Admin Portal Card */}
                  <button
                    type="button"
                    onClick={() => onOpenPortal('admin')}
                    className="group flex flex-col justify-between rounded-xl border border-zinc-700 bg-gradient-to-b from-zinc-800/50 to-[#111114] p-3.5 text-left transition-colors hover:border-zinc-400 hover:from-zinc-800/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-950">
                          <ShieldCheck className="h-4 w-4" />
                        </span>
                        <ArrowRight className="h-4 w-4 text-zinc-300 transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <h2 className="mt-2.5 font-display text-lg font-bold text-white leading-tight">
                        Admin Portal
                      </h2>
                      <p className="mt-1 text-[11px] leading-snug text-zinc-300">
                        Owner TAMHEED · Approvals, trainers &amp; feedback
                      </p>
                    </div>
                    <span className="mt-3 inline-flex items-center text-[11px] font-semibold text-zinc-200">
                      {currentUser?.role === 'admin' ? 'Open Owner Console' : 'Admin Sign In'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <button
                type="button"
                onClick={() => openLightboxById('hero-emblem')}
                aria-label="Inspect FitBase main floor photo"
                className="group gym-media-frame block h-80 w-full rounded-xl border border-zinc-800 text-left sm:h-[400px] lg:h-full lg:min-h-[430px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <img
                  src={MEDIA.heroGym}
                  alt="FitBase Fitness Center signature gold wall emblem and strength machine floor in Faisalabad"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover object-[50%_40%] gym-media-filter group-hover:scale-[1.03]"
                />
                <div className="relative z-10 pointer-events-none" />
                <div className="absolute inset-x-5 bottom-5 z-10 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs text-yellow-400">
                      GREEN AVENUE FLOOR · FAISALABAD
                    </p>
                    <p className="font-display text-xl font-semibold text-white">
                      Calibrated Free Weights, Cable Stacks &amp; Conditioning Turf
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-950/80 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors group-hover:border-zinc-500 group-hover:text-white whitespace-nowrap shrink-0">
                    <Expand className="h-3.5 w-3.5 text-yellow-400" />
                    <span>Inspect Floor</span>
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* 4-Column Facility Spec Strip */}
          <div className="mt-8 grid grid-cols-1 divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-[#111114] sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
            <div className="p-5">
              <p className="text-xs font-medium text-zinc-400">Official Summer Timings</p>
              <p className="mt-1 font-mono text-lg font-semibold text-white tabular-nums">
                6:00 AM – 12:00 AM
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Co &amp; Ladies Only (10 AM–4:30 PM) · Fri Off
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs font-medium text-zinc-400">Starting Membership</p>
              <p className="mt-1 font-mono text-lg font-semibold text-white tabular-nums">
                PKR 6,000 / mo
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">Student ID · Official PKR 7,000/mo</p>
            </div>
            <div className="p-5">
              <p className="text-xs font-medium text-zinc-400">Environment &amp; Comfort</p>
              <p className="mt-1 font-mono text-lg font-semibold text-white">
                Fully Air-Conditioned
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                AC On · Executive Changing Rooms
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs font-medium text-zinc-400">Direct Contact &amp; Desk</p>
              <p className="mt-1 font-mono text-lg font-semibold text-white tabular-nums">
                0312-8330203
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">Alt: 0319-7663203 · All Facilities Included</p>
            </div>
          </div>
        </div>
      </section>

      {/* Facility & Training Methodology */}
      <section id="facility" className="border-b border-zinc-800/80 py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-wider text-red-500">TRAINING ARCHITECTURE</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Four Dedicated Zones Built Around Progressive Overload
              </h2>
              <p className="mt-3 text-base text-zinc-400">
                Every square foot inside FitBase Faisalabad is zoned for purposeful work—from
                plate-loaded strength stations and free weights to StairMaster cardio, heavy bags,
                and conditioning turf.
              </p>
            </div>
            <p className="font-mono text-xs text-zinc-400 tabular-nums">
              10+ REAL FLOOR PHOTOGRAPHS · CLICK ANY VIEW TO EXPAND
            </p>
          </div>

          {/* Primary Asymmetric 4-Zone Showcase */}
          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Zone 01 */}
            <article className="group flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#111114] lg:col-span-7">
              <button
                type="button"
                onClick={() => openLightboxById('zone-main-aisle')}
                className="gym-media-frame aspect-[4/3] w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <img
                  src={MEDIA.strengthIron}
                  alt="FitBase selectorized strength machine aisle and cable stations"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover object-center gym-media-filter group-hover:scale-[1.03]"
                />
                <span className="absolute right-4 top-4 z-10 inline-flex items-center gap-1 rounded-md border border-zinc-700/80 bg-zinc-950/75 px-2.5 py-1 text-[11px] font-medium text-zinc-200 opacity-0 transition-opacity group-hover:opacity-100">
                  <Expand className="h-3 w-3 text-yellow-400" />
                  <span>Expand</span>
                </span>
              </button>
              <div className="flex flex-1 flex-col justify-between p-6">
                <div>
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span>01. Selectorized Strength Aisle</span>
                    <span aria-hidden="true">·</span>
                    <span>Pin-Loaded &amp; High Pulley</span>
                  </div>
                  <h3 className="mt-2 font-display text-2xl font-bold text-white">
                    Commercial Biomechanical Machine Line
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    Dedicated chest, shoulder, back, and leg stations arranged down the main
                    training corridor for zero-wait supersets and controlled hypertrophy blocks.
                  </p>
                </div>
              </div>
            </article>

            {/* Zone 02 */}
            <article className="group flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#111114] lg:col-span-5">
              <button
                type="button"
                onClick={() => openLightboxById('zone-plate-bay')}
                className="gym-media-frame aspect-[4/3] w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <img
                  src={MEDIA.plateRackBay}
                  alt="FitBase plate-loaded free weight bay and dumbbell mirror wall"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover object-[50%_58%] gym-media-filter group-hover:scale-[1.03]"
                />
                <span className="absolute right-4 top-4 z-10 inline-flex items-center gap-1 rounded-md border border-zinc-700/80 bg-zinc-950/75 px-2.5 py-1 text-[11px] font-medium text-zinc-200 opacity-0 transition-opacity group-hover:opacity-100">
                  <Expand className="h-3 w-3 text-yellow-400" />
                  <span>Expand</span>
                </span>
              </button>
              <div className="flex flex-1 flex-col justify-between p-6">
                <div>
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span>02. Free Weight &amp; Plate Bay</span>
                    <span aria-hidden="true">·</span>
                    <span>Mirror-Aligned Iron</span>
                  </div>
                  <h3 className="mt-2 font-display text-2xl font-bold text-white">
                    Heavy Plates, Incline Benches &amp; Dumbbells
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    Full dumbbell runs, plate-loaded leverage rows, and heavy bench stations under
                    recessed acoustic ceiling rings.
                  </p>
                </div>
              </div>
            </article>

            {/* Zone 03 */}
            <article className="group flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#111114] lg:col-span-4">
              <button
                type="button"
                onClick={() => openLightboxById('zone-cardio-deck')}
                className="gym-media-frame aspect-[4/3] w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <img
                  src={MEDIA.conditioningTurf}
                  alt="FitBase StairMaster climber and commercial treadmill cardio deck"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover object-center gym-media-filter group-hover:scale-[1.03]"
                />
              </button>
              <div className="p-6">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span>03. Cardio Window Deck</span>
                  <span aria-hidden="true">·</span>
                  <span>StairMaster &amp; Treadmills</span>
                </div>
                <h3 className="mt-2 font-display text-xl font-bold text-white">
                  Endurance &amp; Metabolic Line
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Commercial LifeFitness treadmills, StairMaster climber, and upright cycles
                  overlooking Canal Road.
                </p>
              </div>
            </article>

            {/* Zone 04 */}
            <article className="group flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#111114] lg:col-span-4">
              <button
                type="button"
                onClick={() => openLightboxById('zone-boxing-turf')}
                className="gym-media-frame aspect-[4/3] w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <img
                  src={MEDIA.boxingTurf}
                  alt="FitBase boxing heavy bag, interval timer clock, and green turf floor"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover object-center gym-media-filter group-hover:scale-[1.03]"
                />
              </button>
              <div className="p-6">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span>04. Boxing &amp; Turf Arena</span>
                  <span aria-hidden="true">·</span>
                  <span>Live Interval Clock</span>
                </div>
                <h3 className="mt-2 font-display text-xl font-bold text-white">
                  Heavy Bag &amp; Conditioning Turf
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Suspended heavy bag, wall-mounted LED round clock, and cushioned turf for pad
                  work, sled pushes, and core drills.
                </p>
              </div>
            </article>

            {/* Verified Member Proof Adjacent to Zones */}
            <div className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-[#111114] p-6 lg:col-span-4">
              <div>
                <p className="text-xs font-semibold text-yellow-400">VERIFIED MEMBER OUTCOME</p>
                <p className="mt-3 text-sm leading-relaxed text-zinc-200">
                  &ldquo;Before joining FitBase, I trained without tracking loads or consistency.
                  After four months on Coach Bilal&apos;s squat block and logging every session in
                  the Member Portal, my back squat moved from 110 kg to 137.5 kg while dropping 4
                  kg.&rdquo;
                </p>
              </div>
              <div className="mt-6 border-t border-zinc-800 pt-4">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="font-medium text-zinc-200">Hamza Raza</span>
                  <span aria-hidden="true">·</span>
                  <span>Official Package Member since 2025</span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Facility Floor Gallery */}
          <div className="mt-14 border-t border-zinc-800/80 pt-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-wider text-red-500">
                  INSIDE THE GREEN AVENUE FLOOR
                </p>
                <h3 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">
                  Equipment Bays, Cable Towers &amp; Locker Amenities
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-800 bg-[#111114] p-1">
                {GALLERY_FILTERS.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setGalleryFilter(cat)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      galleryFilter === cat
                        ? 'bg-red-600 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredGallery.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openLightboxById(item.id)}
                  className="group flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#111114] text-left transition-colors hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  <div className="gym-media-frame aspect-[4/5] w-full">
                    <img
                      src={item.src}
                      alt={`${item.title} — FitBase Fitness Center`}
                      referrerPolicy="no-referrer"
                      style={{ objectPosition: item.objectPosition || '50% 50%' }}
                      className="h-full w-full object-cover gym-media-filter group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-x-4 bottom-4 z-10 flex items-end justify-between gap-3">
                      <div>
                        <p className="font-mono text-[11px] text-yellow-400">{item.zone}</p>
                        <p className="font-display text-xl font-bold text-white">{item.title}</p>
                      </div>
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-950/80 text-zinc-200 transition-colors group-hover:border-red-500 group-hover:text-white">
                        <Expand className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-xs leading-relaxed text-zinc-400">{item.caption}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Weekly Class Schedule */}
      <section id="schedule" className="border-b border-zinc-800/80 py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-wider text-red-500">WEEKLY TIMETABLE</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Coach-Led Group Sessions
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                Filter by training day or discipline and reserve your platform spot directly.
              </p>
            </div>

            {bookingNotice && (
              <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-200">
                {bookingNotice}
              </div>
            )}
          </div>

          {/* Official Summer Timings + Only Female Weekly Fitness Classes */}
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Official Summer Timings */}
            <div className="rounded-xl border border-zinc-800 bg-[#111114] p-6 lg:col-span-5 flex flex-col justify-between">
              <div>
                <p className="text-xs font-semibold tracking-wider text-yellow-400">
                  OFFICIAL SUMMER TIMINGS
                </p>
                <h3 className="mt-1.5 font-display text-2xl font-bold text-white">
                  Daily Floor &amp; Ladies-Only Hours
                </h3>
                <p className="mt-1 text-xs text-zinc-400">
                  Dedicated separate window for ladies alongside morning and evening co-training.
                </p>

                <dl className="mt-5 divide-y divide-zinc-800 border-t border-b border-zinc-800">
                  <div className="flex items-center justify-between py-3.5 text-sm">
                    <dt className="font-medium text-zinc-200">Morning Co Timing</dt>
                    <dd className="font-mono font-semibold text-white tabular-nums">
                      06:00 AM – 10:00 AM
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-3.5 text-sm">
                    <dt className="font-medium text-red-400">Ladies Only Timing</dt>
                    <dd className="font-mono font-semibold text-yellow-400 tabular-nums">
                      10:00 AM – 04:30 PM
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-3.5 text-sm">
                    <dt className="font-medium text-zinc-200">Evening Co Timing</dt>
                    <dd className="font-mono font-semibold text-white tabular-nums">
                      05:00 PM – 12:00 AM
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-3.5 text-sm">
                    <dt className="font-medium text-zinc-400">Weekly Closed Day</dt>
                    <dd className="font-mono font-semibold text-red-400">FRIDAY IS OFF</dd>
                  </div>
                </dl>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                <span>Fully Air-Conditioned Throughout</span>
                <span className="font-mono text-zinc-300">0312-8330203 · 0319-7663203</span>
              </div>
            </div>

            {/* Weekly Fitness Classes — Only Female */}
            <div className="rounded-xl border border-zinc-800 bg-[#111114] p-6 lg:col-span-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-red-500">
                    ONLY FEMALE · INCLUDED FREE IN PACKAGE
                  </p>
                  <h3 className="mt-1 font-display text-2xl font-bold text-white">
                    Weekly Female Fitness Classes
                  </h3>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs">
                  <p className="font-mono text-yellow-400 tabular-nums">
                    1st Class: 11:30 AM – 12:00 PM
                  </p>
                  <p className="font-mono text-zinc-300 tabular-nums">
                    2nd Class: 03:00 PM – 03:30 PM
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {femaleWeeklyClasses.map((item) => (
                  <div
                    key={item.day}
                    className={`flex items-center justify-between rounded-lg border px-4 py-2.5 text-xs ${
                      item.status === 'Off'
                        ? 'border-zinc-800/70 bg-zinc-950/60 text-zinc-500'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-200'
                    }`}
                  >
                    <span className="font-semibold text-white">{item.day}</span>
                    <span
                      className={
                        item.status === 'Off' ? 'font-mono text-zinc-500' : 'text-yellow-400 font-medium'
                      }
                    >
                      {item.workout}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Filter Controls */}
          <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-800 bg-[#111114] p-1">
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    selectedDay === day
                      ? 'bg-red-600 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-800 bg-[#111114] p-1">
              {DISCIPLINES.map((disc) => (
                <button
                  key={disc}
                  type="button"
                  onClick={() => setSelectedDiscipline(disc)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    selectedDiscipline === disc
                      ? 'bg-zinc-100 text-zinc-950'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {disc}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule Table */}
          <div className="mt-6 overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs font-medium text-zinc-400">
                  <tr>
                    <th className="px-5 py-3.5">Day &amp; Time</th>
                    <th className="px-5 py-3.5">Session</th>
                    <th className="px-5 py-3.5">Coach &amp; Zone</th>
                    <th className="px-5 py-3.5">Intensity</th>
                    <th className="px-5 py-3.5 text-right">Spots</th>
                    <th className="px-5 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {filteredClasses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-sm text-zinc-400">
                        {classes.length === 0
                          ? 'No group sessions have been published to the live timetable yet.'
                          : selectedDay === 'Fri'
                            ? 'Friday is an Official Off Day at FitBase Fitness Center (no classes scheduled).'
                            : 'No sessions match the selected day and discipline filter.'}
                      </td>
                    </tr>
                  ) : (
                    filteredClasses.map((cls) => {
                      const spotsLeft = Math.max(0, cls.capacity - cls.bookedMemberIds.length);
                      const isBooked = currentUser
                        ? cls.bookedMemberIds.includes(currentUser.id)
                        : false;

                      return (
                        <tr key={cls.id} className="transition-colors hover:bg-zinc-900/40">
                          <td className="px-5 py-4 font-mono text-xs text-zinc-300 tabular-nums">
                            <span className="font-semibold text-white">{cls.dayOfWeek}</span>
                            <span aria-hidden="true" className="mx-1.5 text-zinc-600">·</span>
                            <span>{cls.startTime}</span>
                            <span aria-hidden="true" className="mx-1.5 text-zinc-600">·</span>
                            <span>{cls.durationMin}m</span>
                          </td>
                          <td className="px-5 py-4">
                            <p className="font-semibold text-white">{cls.title}</p>
                            <p className="text-xs text-zinc-400">
                              <span>{cls.discipline}</span>
                              {cls.audience && (
                                <>
                                  <span aria-hidden="true" className="mx-1.5 text-zinc-600">·</span>
                                  <span
                                    className={
                                      cls.audience === 'Female Only'
                                        ? 'text-yellow-400 font-medium'
                                        : 'text-zinc-300'
                                    }
                                  >
                                    {cls.audience}
                                  </span>
                                </>
                              )}
                              {cls.slotLabel && (
                                <>
                                  <span aria-hidden="true" className="mx-1.5 text-zinc-600">·</span>
                                  <span>{cls.slotLabel}</span>
                                </>
                              )}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-zinc-200">{cls.trainerName}</p>
                            <p className="text-xs text-zinc-500">{cls.zone}</p>
                          </td>
                          <td className="px-5 py-4 text-xs text-zinc-300">{cls.intensity}</td>
                          <td className="px-5 py-4 text-right font-mono text-xs tabular-nums text-zinc-300">
                            {spotsLeft} / {cls.capacity} open
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              disabled={bookingBusyId === cls.id || (!isBooked && spotsLeft === 0)}
                              onClick={() => handleToggleBooking(cls.id)}
                              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                                isBooked
                                  ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                                  : spotsLeft === 0
                                    ? 'cursor-not-allowed bg-zinc-800 text-zinc-500'
                                    : 'bg-zinc-100 text-zinc-950 hover:bg-white'
                              }`}
                            >
                              {bookingBusyId === cls.id
                                ? 'Updating...'
                                : isBooked
                                  ? 'Booked · Cancel'
                                  : spotsLeft === 0
                                    ? 'Class Full'
                                    : 'Reserve Spot'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Membership Plans */}
      <section id="memberships" className="border-b border-zinc-800/80 py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-wider text-red-500">MEMBERSHIP PACKAGES</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Official Fee Structure — All Facilities Included
            </h2>
            <p className="mt-3 text-base text-zinc-400">
              Every plan includes full access to state-of-the-art equipment, powerful air
              conditioning throughout, executive changing rooms, and free female-only group classes.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {membershipPlans.map((plan) => (
              <div
                key={plan.tier}
                className={`flex flex-col justify-between rounded-xl border p-6 ${
                  plan.featured
                    ? 'border-yellow-400/60 bg-[#141418]'
                    : 'border-zinc-800 bg-[#111114]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-xl font-bold text-white">{plan.tier}</h3>
                    {plan.badge && (
                      <span className="text-xs font-semibold text-yellow-400 whitespace-nowrap shrink-0">
                        {plan.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">{plan.audience}</p>

                  <div className="mt-5 flex flex-wrap items-baseline gap-1.5">
                    <span className="font-mono text-2xl font-bold text-white tabular-nums">
                      {formatPkr(plan.price)}
                    </span>
                    <span className="text-xs text-zinc-400">{plan.billingLabel}</span>
                  </div>

                  <div className="my-5 h-px bg-zinc-800" />

                  <ul className="space-y-2.5 text-xs text-zinc-300">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    currentUser ? onOpenPortal() : onOpenAuth('register', plan.tier)
                  }
                  className={`mt-7 w-full rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    plan.featured
                      ? 'bg-red-600 text-white hover:bg-red-500'
                      : 'border border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-zinc-500'
                  }`}
                >
                  {currentUser ? 'Manage Plan in Portal' : `Join ${plan.tier}`}
                </button>
              </div>
            ))}
          </div>

          {/* Supported Payment Channels Strip */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-[#111114] px-6 py-4 text-xs text-zinc-400">
            <div className="flex items-center gap-2 text-zinc-200 font-medium">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Accepted Payment Verification Channels</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 font-mono text-zinc-300">
              <span>JazzCash · 0312-8330203</span>
              <span aria-hidden="true" className="text-zinc-700">/</span>
              <span>EasyPaisa · 0319-7663203</span>
              <span aria-hidden="true" className="text-zinc-700">/</span>
              <span>Meezan IBAN · PK36MEZN0002140104829103</span>
              <span aria-hidden="true" className="text-zinc-700">/</span>
              <span>Front Desk Cash</span>
            </div>
          </div>
        </div>
      </section>

      {/* Coaching Staff */}
      <section id="coaching" className="border-b border-zinc-800/80 py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-wider text-red-500">COACHING STAFF</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Specialists Accountable to Your Progress
            </h2>
            <p className="mt-3 text-base text-zinc-400">
              Every coach is evaluated monthly on member retention, class completion, and verified
              athlete feedback.
            </p>
          </div>

          {trainers.length === 0 ? (
            <div className="mt-10 rounded-xl border border-zinc-800 bg-[#111114] p-8 text-center text-sm text-zinc-400">
              Certified FitBase coaching profiles will appear here once added by management in the
              Admin Portal.
            </div>
          ) : (
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {trainers.map((trainer) => {
                const portrait = getTrainerPortrait(trainer.portraitKey, trainer.portraitUrl);
                const initials = trainer.name
                  .split(' ')
                  .filter(Boolean)
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 3);

                return (
                  <article
                    key={trainer.id}
                    className="flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]"
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-zinc-900">
                      {portrait ? (
                        <>
                          <img
                            src={portrait}
                            alt={`${trainer.name} — ${trainer.specialty}`}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover gym-media-filter"
                          />
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#111114]/65 via-transparent to-transparent" />
                        </>
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-[#180A0C] to-zinc-950 p-6 text-center">
                          <span className="font-display text-5xl font-bold tracking-wider text-red-500">
                            {initials}
                          </span>
                          <span className="mt-2 text-xs text-zinc-400">{trainer.certifications}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col justify-between p-5">
                      <div>
                        <h3 className="font-display text-xl font-bold text-white">{trainer.name}</h3>
                        <p className="text-xs font-medium text-red-400">{trainer.specialty}</p>
                        <p className="mt-3 text-xs leading-relaxed text-zinc-400">{trainer.bio}</p>
                      </div>
                      <div className="mt-4 border-t border-zinc-800 pt-3 flex items-center justify-between text-xs text-zinc-400 font-mono tabular-nums">
                        <span>{trainer.experienceYears} yrs exp</span>
                        <span className="text-yellow-400">{trainer.rating.toFixed(1)} / 5.0</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Contact & Direct Feedback Form */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5 space-y-6">
              <div>
                <p className="text-xs font-semibold tracking-wider text-red-500">
                  LOCATION &amp; AI CONCIERGE
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-white">
                  Visit the Floor or Ask FitBase AI
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  Get instant answers on membership packages, Summer Co-Ed &amp; Ladies-Only
                  schedules, free female group classes, payment verification, and biometric
                  fingerprint check-in policies.
                </p>
              </div>

              <div className="gym-media-frame rounded-xl border border-zinc-800">
                <div className="aspect-[16/10] w-full overflow-hidden bg-zinc-950">
                  <img
                    src={MEDIA.facilityExterior}
                    alt="FitBase facility exterior at Near Marhaba Mart, Green Avenue, East Canal Road, Faisalabad"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover object-center gym-media-filter"
                  />
                </div>
                <div className="absolute bottom-3 left-4 right-4 z-10 flex items-center justify-between text-xs">
                  <span className="font-mono text-yellow-400">FACILITY EXTERIOR</span>
                  <span className="text-zinc-200 font-medium">Near Marhaba Mart · Green Avenue</span>
                </div>
              </div>

              <div className="space-y-4 border-t border-zinc-800 pt-6 text-sm text-zinc-300">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <span>Near Marhaba Mart, Green Avenue, East Canal Road, Faisalabad</span>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <span>
                    Morning Co 6 AM–10 AM · Ladies Only 10 AM–4:30 PM · Evening Co 5 PM–12 AM (Friday
                    Off)
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <span className="font-mono">0312-8330203 · 0319-7663203</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <FitBaseChatPanel
                messages={chat.messages}
                input={chat.input}
                onChangeInput={chat.setInput}
                busy={chat.busy}
                error={chat.error}
                onSend={chat.sendMessage}
                onReset={chat.resetChat}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 bg-[#070709] py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
            <div className="flex items-start gap-3.5">
              <FitBaseLogo size="sm" />
              <div className="space-y-1">
                <p className="font-display text-xl font-bold tracking-wide text-white leading-none">
                  FIT<span className="text-red-500">BASE</span>
                </p>
                <BrandRoleCredits variant="footer" className="pt-0.5" />
                <p className="text-xs text-zinc-500">
                  Near Marhaba Mart, Green Avenue, East Canal Road, Faisalabad · www.fitbasegym.pk
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="https://wa.me/923128330203?text=Assalam-o-Alaikum%20FitBase%20Fitness%20Center%2C%20I%20would%20like%20details%20about%20membership%20packages%20and%20timings."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 whitespace-nowrap shrink-0"
              >
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span>WhatsApp · 0312-8330203</span>
              </a>

              <a
                href="https://www.instagram.com/fitbasefitnesscenter?igsh=MW03ZmU3Y204Z2hkaQ%3D%3D&utm_source=qr"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-zinc-100 transition-colors hover:border-red-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 whitespace-nowrap shrink-0"
              >
                <Instagram className="h-4 w-4 shrink-0 text-red-400" />
                <span>@fitbasefitnesscenter</span>
              </a>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-800/80 pt-6 text-xs text-zinc-400">
            <div className="flex flex-wrap items-center gap-6">
              <a href="#facility" className="hover:text-white">
                Facility
              </a>
              <a href="#schedule" className="hover:text-white">
                Timings &amp; Classes
              </a>
              <a href="#memberships" className="hover:text-white">
                Packages
              </a>
              <button
                type="button"
                onClick={() => onOpenPortal('member')}
                className="text-red-400 hover:text-red-300 font-medium"
              >
                Member Portal
              </button>
              <button
                type="button"
                onClick={() => onOpenPortal('reception')}
                className="text-amber-400 hover:text-amber-300 font-medium"
              >
                Reception Portal
              </button>
              <button
                type="button"
                onClick={() => onOpenPortal('admin')}
                className="text-zinc-200 hover:text-white font-medium"
              >
                Admin Portal
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-zinc-500">
              <span>© 2026 FitBase Fitness Center</span>
              <span aria-hidden="true">·</span>
              <span>
                Gym Owner: <strong className="font-semibold text-yellow-400">TAMHEED</strong>
              </span>
              <span aria-hidden="true">·</span>
              <a
                href="https://masudcollection.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-300 underline decoration-zinc-700 underline-offset-2 hover:text-red-400"
              >
                Built by AI Specialist SHAFFAN
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Facility Photo Lightbox */}
      {lightboxIndex !== null && allShowcasePhotos[lightboxIndex] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={allShowcasePhotos[lightboxIndex].title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#111114]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
              <div>
                <p className="font-mono text-xs text-yellow-400">
                  {allShowcasePhotos[lightboxIndex].zone} · {lightboxIndex + 1} /{' '}
                  {allShowcasePhotos.length}
                </p>
                <h4 className="font-display text-xl font-bold text-white">
                  {allShowcasePhotos[lightboxIndex].title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                aria-label="Close photo viewer"
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-zinc-300 hover:border-zinc-600 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#09090B]">
              <img
                src={allShowcasePhotos[lightboxIndex].src}
                alt={allShowcasePhotos[lightboxIndex].title}
                referrerPolicy="no-referrer"
                className="max-h-[68vh] w-auto object-contain gym-media-filter"
              />
              <button
                type="button"
                onClick={() =>
                  setLightboxIndex(
                    (lightboxIndex - 1 + allShowcasePhotos.length) % allShowcasePhotos.length
                  )
                }
                aria-label="Previous facility photo"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg border border-zinc-700 bg-zinc-950/85 p-2.5 text-zinc-200 hover:border-zinc-500 hover:text-white"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setLightboxIndex((lightboxIndex + 1) % allShowcasePhotos.length)}
                aria-label="Next facility photo"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg border border-zinc-700 bg-zinc-950/85 p-2.5 text-zinc-200 hover:border-zinc-500 hover:text-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="border-t border-zinc-800 px-5 py-3.5 text-xs text-zinc-300">
              {allShowcasePhotos[lightboxIndex].caption}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

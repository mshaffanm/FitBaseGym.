import trainerPortrait1 from './assets/images/trainer_portrait_1_1794677959220.jpg';
import trainerPortrait2 from './assets/images/trainer_portrait_2_1794677959073.jpg';
import type { TrainerRecord } from './types';

export const BRAND_LOGO_SRC = '/assets/aistudio/Fit__Base_Gym_9b609dc5.jfif';
export const FACILITY_EXTERIOR_PHOTO = '/assets/aistudio/unnamed__1__51183bb8.webp';
export const FACILITY_INTERIOR_TURF_PHOTO = '/assets/aistudio/unnamed_9e8b1868.webp';

// Authentic FitBase facility photography (Faisalabad)
export const FACILITY_PHOTOS = {
  goldEmblemFloor: '/assets/aistudio/WhatsApp_Image_2026-11-14_at_11.53.24_PM__1__c89b7efd.jpeg',
  mainAisle: '/assets/aistudio/WhatsApp_Image_2026-11-14_at_11.53.23_PM__3__decf84dd.jpeg',
  plateRackBay: '/assets/aistudio/WhatsApp_Image_2026-11-14_at_11.53.23_PM__2__5b45ad7c.jpeg',
  cardioDeck: '/assets/aistudio/WhatsApp_Image_2026-11-14_at_11.53.25_PM__2__5f923805.jpeg',
  boxingTurf: '/assets/aistudio/WhatsApp_Image_2026-11-14_at_11.53.25_PM__1__40f31245.jpeg',
  inclineBenchBay: '/assets/aistudio/WhatsApp_Image_2026-11-14_at_11.53.23_PM__1__8cfcb548.jpeg',
  cablePulldownBay: '/assets/aistudio/WhatsApp_Image_2026-11-14_at_11.53.23_PM_f9c09d7f.jpeg',
  freeWeightSmith: '/assets/aistudio/WhatsApp_Image_2026-11-14_at_11.53.24_PM__2__ea172868.jpeg',
  selectorizedCircuit: '/assets/aistudio/WhatsApp_Image_2026-11-14_at_11.53.24_PM_0fde608b.jpeg',
  lockersHighPulley: '/assets/aistudio/WhatsApp_Image_2026-11-14_at_11.53.25_PM_9a32c05c.jpeg',
  mainTurfFloor: FACILITY_INTERIOR_TURF_PHOTO,
  exteriorNight: FACILITY_EXTERIOR_PHOTO,
} as const;

export interface FacilityGalleryItem {
  id: string;
  src: string;
  title: string;
  zone: string;
  category: 'Free Weights' | 'Machines & Cables' | 'Cardio & Boxing' | 'Amenities';
  caption: string;
  objectPosition?: string;
}

export const FACILITY_GALLERY: FacilityGalleryItem[] = [
  {
    id: 'gal-free-weight-smith',
    src: FACILITY_PHOTOS.freeWeightSmith,
    title: 'Free Weight & Smith Station',
    zone: 'Free Weight Zone',
    category: 'Free Weights',
    caption: 'Guided Smith rack, adjustable incline benches, and full dumbbell wall under brick-mirror LED trim.',
    objectPosition: '50% 48%',
  },
  {
    id: 'gal-incline-benches',
    src: FACILITY_PHOTOS.inclineBenchBay,
    title: 'Dumbbell & Bench Mirror Wall',
    zone: 'Hypertrophy Bay',
    category: 'Free Weights',
    caption: 'Tiered rubberized dumbbell pairs, preacher curl stations, and Olympic press benches.',
    objectPosition: '50% 52%',
  },
  {
    id: 'gal-cable-lat',
    src: FACILITY_PHOTOS.cablePulldownBay,
    title: 'Lat Pulldown & Cable Wing',
    zone: 'Upper Body Strength',
    category: 'Machines & Cables',
    caption: 'Plate-loaded and pin-stack pulling towers positioned along full-length alignment mirrors.',
    objectPosition: '50% 50%',
  },
  {
    id: 'gal-selectorized-circuit',
    src: FACILITY_PHOTOS.selectorizedCircuit,
    title: 'Abdominal & Leg Circuit',
    zone: 'Machine Floor',
    category: 'Machines & Cables',
    caption: 'Dedicated core crunch, leg curl, and seated chest machines laid out for smooth circuit flow.',
    objectPosition: '50% 55%',
  },
  {
    id: 'gal-turf-floor',
    src: FACILITY_PHOTOS.mainTurfFloor,
    title: 'Functional Turf & Treadmill Lane',
    zone: 'Conditioning Floor',
    category: 'Cardio & Boxing',
    caption: 'Open turf mobility floor flanked by cardio treadmills, stability balls, and plate machines.',
    objectPosition: '50% 55%',
  },
  {
    id: 'gal-lockers-pulley',
    src: FACILITY_PHOTOS.lockersHighPulley,
    title: 'High Pulley & Locker Suite',
    zone: 'Amenities & Cables',
    category: 'Amenities',
    caption: 'Dual high-pulley cable crossover tower adjacent to full-height marble-finish lockers and chilled water.',
    objectPosition: '50% 45%',
  },
];

export const MEDIA = {
  heroGym: FACILITY_PHOTOS.goldEmblemFloor,
  strengthIron: FACILITY_PHOTOS.mainAisle,
  plateRackBay: FACILITY_PHOTOS.plateRackBay,
  conditioningTurf: FACILITY_PHOTOS.cardioDeck,
  boxingTurf: FACILITY_PHOTOS.boxingTurf,
  facilityExterior: FACILITY_PHOTOS.exteriorNight,
  coachBilal: trainerPortrait1,
  coachAyesha: trainerPortrait2,
};

export function getTrainerPortrait(
  key: TrainerRecord['portraitKey'],
  portraitUrl?: string | null
): string | null {
  if (portraitUrl && portraitUrl.trim()) return portraitUrl.trim();
  if (key === 'coach_bilal') return trainerPortrait1;
  if (key === 'coach_ayesha') return trainerPortrait2;
  return null;
}

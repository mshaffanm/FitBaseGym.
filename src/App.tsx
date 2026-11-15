import { useCallback, useEffect, useState } from 'react';
import { api, getAuthToken, signOutSession } from './api';
import { Navbar } from './components/Navbar';
import { HomePage } from './components/HomePage';
import { AuthModal } from './components/AuthModal';
import { MemberPortal } from './components/MemberPortal';
import { AdminPortal } from './components/AdminPortal';
import { ReceptionPortal } from './components/ReceptionPortal';
import { BrandRoleCredits } from './components/Brand';
import { FitBaseFloatingChatbot, useFitBaseChat } from './components/FitBaseChatbot';
import type { GymClass, MembershipTier, PortalTarget, TrainerRecord, UserProfile } from './types';

export default function App() {
  const [view, setView] = useState<'home' | 'portal'>('home');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authPortal, setAuthPortal] = useState<PortalTarget>('member');
  const [authError, setAuthError] = useState('');
  const [preselectedTier, setPreselectedTier] = useState<MembershipTier>('Official Package');

  const [classes, setClasses] = useState<GymClass[]>([]);
  const [trainers, setTrainers] = useState<TrainerRecord[]>([]);
  const [tiers, setTiers] = useState<Record<MembershipTier, number>>({
    'Student Package': 6000,
    'Official Package': 7000,
    '3 Months Package': 16000,
    '6 Months Package': 30000,
    '12 Months Package': 50000,
  });
  const [booting, setBooting] = useState(true);
  const fitBaseChat = useFitBaseChat();

  const loadPublicData = useCallback(async () => {
    try {
      const overview = await api.getPublicOverview();
      setClasses(overview.classes);
      setTrainers(overview.trainers);
      setTiers(overview.tiers);
    } catch {
      // Public overview retryable
    }
  }, []);

  const handleMembershipExpired = useCallback(() => {
    signOutSession();
    setCurrentUser(null);
    setView('home');
    setAuthPortal('member');
    setAuthMode('login');
    setAuthError('Membership Expired.');
    setAuthModalOpen(true);
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      await loadPublicData();
      if (getAuthToken()) {
        try {
          const { user } = await api.getMe();
          if (active) {
            setCurrentUser(user);
          }
        } catch (err) {
          signOutSession();
          if (active && err instanceof Error && err.message.includes('Membership Expired')) {
            setAuthPortal('member');
            setAuthMode('login');
            setAuthError('Membership Expired.');
            setAuthModalOpen(true);
          }
        }
      }
      if (active) {
        setBooting(false);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, [loadPublicData]);

  const handleOpenAuth = (
    mode: 'login' | 'register' = 'login',
    tier?: MembershipTier,
    targetPortal: PortalTarget = 'member'
  ) => {
    setAuthPortal(targetPortal);
    setAuthMode(targetPortal === 'member' ? mode : 'login');
    setAuthError('');
    if (tier) setPreselectedTier(tier);
    setAuthModalOpen(true);
  };

  const handleOpenPortal = (targetPortal?: PortalTarget) => {
    if (currentUser && (!targetPortal || currentUser.role === targetPortal)) {
      setView('portal');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      handleOpenAuth('login', undefined, targetPortal || 'member');
    }
  };

  const handleAuthenticated = (user: UserProfile) => {
    setAuthError('');
    setCurrentUser(user);
    setAuthModalOpen(false);
    setView('portal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSignOut = () => {
    signOutSession();
    setCurrentUser(null);
    setAuthError('');
    setView('home');
    void loadPublicData();
  };

  const handleNavigateSection = (sectionId: string) => {
    if (view !== 'home') {
      setView('home');
      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090B] text-zinc-400">
        <div className="text-center space-y-1.5">
          <p className="font-display text-2xl font-bold tracking-wide text-white">
            FIT<span className="text-red-500">BASE</span>
          </p>
          <BrandRoleCredits className="flex flex-col items-center" />
          <p className="text-xs text-zinc-500">Loading facility schedule &amp; portal...</p>
        </div>
      </div>
    );
  }

  if (view === 'portal' && currentUser) {
    if (currentUser.role === 'admin') {
      return (
        <AdminPortal
          currentUser={currentUser}
          onTrainersChanged={loadPublicData}
          onBackToSite={() => {
            setView('home');
            void loadPublicData();
          }}
          onSignOut={handleSignOut}
        />
      );
    }

    if (currentUser.role === 'reception') {
      return (
        <ReceptionPortal
          currentUser={currentUser}
          onBackToSite={() => {
            setView('home');
            void loadPublicData();
          }}
          onSignOut={handleSignOut}
        />
      );
    }

    return (
      <MemberPortal
        currentUser={currentUser}
        onUserUpdated={setCurrentUser}
        onMembershipExpired={handleMembershipExpired}
        onBackToSite={() => {
          setView('home');
          void loadPublicData();
        }}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100">
      <Navbar
        currentUser={currentUser}
        onOpenPortal={handleOpenPortal}
        onNavigateSection={handleNavigateSection}
      />

      <HomePage
        classes={classes}
        trainers={trainers}
        tiers={tiers}
        currentUser={currentUser}
        chat={fitBaseChat}
        onOpenAuth={handleOpenAuth}
        onOpenPortal={handleOpenPortal}
        onClassBookingUpdated={setClasses}
      />

      {!authModalOpen && <FitBaseFloatingChatbot chat={fitBaseChat} />}

      {authModalOpen && (
        <AuthModal
          initialMode={authMode}
          initialPortal={authPortal}
          initialError={authError}
          preselectedTier={preselectedTier}
          onClose={() => {
            setAuthModalOpen(false);
            setAuthError('');
          }}
          onAuthenticated={handleAuthenticated}
        />
      )}
    </div>
  );
}

import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type NavDrawerMode = 'closed' | 'overlay' | 'pinned';

const STORAGE_KEY = 'nav-drawer-pinned';
const MD_BREAKPOINT = 768;

function readPinnedPreference(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

function canPin(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= MD_BREAKPOINT;
}

function initialMode(): NavDrawerMode {
  if (readPinnedPreference() && canPin()) {
    return 'pinned';
  }
  return 'closed';
}

interface NavDrawerContextValue {
  mode: NavDrawerMode;
  isOpen: boolean;
  isPinned: boolean;
  isOverlay: boolean;
  menuButtonRef: RefObject<HTMLButtonElement>;
  openOverlay: () => void;
  close: () => void;
  toggle: () => void;
  pin: () => void;
  unpin: () => void;
  togglePin: () => void;
  closeOnNavigate: () => void;
}

const NavDrawerContext = createContext<NavDrawerContextValue | null>(null);

export function NavDrawerProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<NavDrawerMode>(initialMode);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const isPinned = mode === 'pinned';
  const isOverlay = mode === 'overlay';
  const isOpen = mode !== 'closed';

  const persistPinned = useCallback((pinned: boolean) => {
    localStorage.setItem(STORAGE_KEY, pinned ? 'true' : 'false');
  }, []);

  const openOverlay = useCallback(() => {
    setMode('overlay');
  }, []);

  const close = useCallback(() => {
    if (mode === 'pinned') {
      persistPinned(false);
    }
    setMode('closed');
  }, [mode, persistPinned]);

  const toggle = useCallback(() => {
    if (mode === 'closed') {
      setMode('overlay');
      return;
    }
    close();
  }, [mode, close]);

  const pin = useCallback(() => {
    if (!canPin()) return;
    persistPinned(true);
    setMode('pinned');
  }, [persistPinned]);

  const unpin = useCallback(() => {
    persistPinned(false);
    setMode('closed');
  }, [persistPinned]);

  const togglePin = useCallback(() => {
    if (mode === 'pinned') {
      unpin();
    } else if (mode === 'overlay') {
      pin();
    }
  }, [mode, pin, unpin]);

  const closeOnNavigate = useCallback(() => {
    if (mode === 'overlay') {
      setMode('closed');
      menuButtonRef.current?.focus();
    }
  }, [mode]);

  // Auto-unpin on mobile resize
  useEffect(() => {
    const handleResize = () => {
      if (mode === 'pinned' && !canPin()) {
        persistPinned(false);
        setMode('closed');
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mode, persistPinned]);

  // Body scroll lock for overlay mode only
  useEffect(() => {
    if (isOverlay) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
    document.body.style.overflow = '';
  }, [isOverlay]);

  const value = useMemo(
    () => ({
      mode,
      isOpen,
      isPinned,
      isOverlay,
      menuButtonRef,
      openOverlay,
      close,
      toggle,
      pin,
      unpin,
      togglePin,
      closeOnNavigate,
    }),
    [
      mode,
      isOpen,
      isPinned,
      isOverlay,
      openOverlay,
      close,
      toggle,
      pin,
      unpin,
      togglePin,
      closeOnNavigate,
    ]
  );

  return (
    <NavDrawerContext.Provider value={value}>{children}</NavDrawerContext.Provider>
  );
}

export function useNavDrawer(): NavDrawerContextValue {
  const context = useContext(NavDrawerContext);
  if (!context) {
    throw new Error('useNavDrawer must be used within NavDrawerProvider');
  }
  return context;
}

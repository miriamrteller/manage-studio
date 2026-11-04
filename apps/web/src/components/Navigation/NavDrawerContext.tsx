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
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Saving the pin must never break the menu (private windows, blocked storage). */
function writePinnedPreference(pinned: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, pinned ? 'true' : 'false');
  } catch {
    /* the menu still works for this visit */
  }
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

  const openOverlay = useCallback(() => {
    setMode('overlay');
  }, []);

  // Closing (menu button, Escape, Report a problem, sign out) only hides the menu for now.
  // The saved pin changes only through pin() and unpin().
  const close = useCallback(() => {
    setMode('closed');
  }, []);

  const toggle = useCallback(() => {
    if (mode === 'closed') {
      setMode('overlay');
      return;
    }
    close();
  }, [mode, close]);

  const pin = useCallback(() => {
    if (!canPin()) return;
    writePinnedPreference(true);
    setMode('pinned');
  }, []);

  const unpin = useCallback(() => {
    writePinnedPreference(false);
    setMode('closed');
  }, []);

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

  // Too narrow to stay pinned: hide it, but keep the saved choice for when the window is wide again.
  useEffect(() => {
    const handleResize = () => {
      if (mode === 'pinned' && !canPin()) {
        setMode('closed');
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mode]);

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

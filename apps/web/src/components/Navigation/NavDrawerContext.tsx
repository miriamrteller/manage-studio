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

/** "Icons only" is the one saved choice; full size is the default (owner, 13 Nov 2026). */
const STORAGE_KEY = 'nav-drawer-icons-only';
const MD_BREAKPOINT = 768;

function readIconsOnly(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Saving the choice must never break the menu (private windows, blocked storage). */
function writeIconsOnly(iconsOnly: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, iconsOnly ? 'true' : 'false');
  } catch {
    /* the menu still works for this visit */
  }
}

/** Wide enough to keep the menu always open (a computer or tablet). */
function isWide(): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= MD_BREAKPOINT;
}

interface NavDrawerContextValue {
  mode: NavDrawerMode;
  isOpen: boolean;
  /** Always true on a wide screen: the menu is always there. */
  isPinned: boolean;
  isOverlay: boolean;
  /** Pinned at icons only (names show on hover). */
  isIconsOnly: boolean;
  menuButtonRef: RefObject<HTMLButtonElement>;
  openOverlay: () => void;
  close: () => void;
  toggle: () => void;
  /** Full size <-> icons only. */
  toggleIconsOnly: () => void;
  closeOnNavigate: () => void;
}

const NavDrawerContext = createContext<NavDrawerContextValue | null>(null);

export function NavDrawerProvider({ children }: { children: ReactNode }) {
  // A wide screen always has the menu pinned; a phone opens it from the menu button.
  const [mode, setMode] = useState<NavDrawerMode>(() => (isWide() ? 'pinned' : 'closed'));
  const [iconsOnlyChoice, setIconsOnlyChoice] = useState<boolean>(readIconsOnly);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const isPinned = mode === 'pinned';
  const isOverlay = mode === 'overlay';
  const isOpen = mode !== 'closed';
  // The phone's menu always opens at full size, so the names can be read.
  const isIconsOnly = isPinned && iconsOnlyChoice;

  const openOverlay = useCallback(() => {
    setMode((m) => (m === 'pinned' ? m : 'overlay'));
  }, []);

  // Closing (menu button, Escape, Report a problem, sign out) only hides the phone menu.
  // The pinned menu cannot be closed.
  const close = useCallback(() => {
    setMode((m) => (m === 'pinned' ? m : 'closed'));
  }, []);

  const toggle = useCallback(() => {
    setMode((m) => (m === 'pinned' ? m : m === 'closed' ? 'overlay' : 'closed'));
  }, []);

  const toggleIconsOnly = useCallback(() => {
    setIconsOnlyChoice((prev) => {
      writeIconsOnly(!prev);
      return !prev;
    });
  }, []);

  const closeOnNavigate = useCallback(() => {
    if (mode === 'overlay') {
      setMode('closed');
      menuButtonRef.current?.focus();
    }
  }, [mode]);

  // Narrow: the menu hides behind the menu button. Wide again: always there.
  useEffect(() => {
    const handleResize = () => {
      setMode((m) => {
        if (isWide()) return 'pinned';
        return m === 'pinned' ? 'closed' : m;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      isIconsOnly,
      menuButtonRef,
      openOverlay,
      close,
      toggle,
      toggleIconsOnly,
      closeOnNavigate,
    }),
    [
      mode,
      isOpen,
      isPinned,
      isOverlay,
      isIconsOnly,
      openOverlay,
      close,
      toggle,
      toggleIconsOnly,
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

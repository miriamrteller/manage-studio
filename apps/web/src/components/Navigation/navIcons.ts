import {
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  CalendarPlus,
  Camera,
  ClipboardList,
  GraduationCap,
  Home,
  Inbox,
  LogIn,
  MessageSquare,
  Palette,
  PlusCircle,
  Settings,
  ShoppingBag,
  ToggleRight,
  UserCircle,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { NavAreaKey, NavEntry } from './navigationConfig';

/** Plain object icons only (no images of people: owner rule). */
const AREA_ICONS: Record<NavAreaKey, LucideIcon> = {
  home: Home,
  leads: Inbox,
  people: Users,
  classes: GraduationCap,
  projects: Briefcase,
  bookings: CalendarDays,
  shop: ShoppingBag,
  finance: Wallet,
  settings: Settings,
};

const PATH_ICONS: Record<string, LucideIcon> = {
  '/': Home,
  '/classes': GraduationCap,
  '/book': CalendarPlus,
  '/login': LogIn,
  '/signup': UserPlus,
  '/platform/onboard': PlusCircle,
  '/platform/features': ToggleRight,
  '/platform/feedback': MessageSquare,
  '/platform/skins': Palette,
  '/dashboard/portal': UserCircle,
  '/dashboard/student': BookOpen,
  '/teach': ClipboardList,
};

export function navEntryIcon(entry: NavEntry, vertical?: string | null): LucideIcon {
  if (entry.area === 'projects' && vertical === 'photographer') return Camera;
  if (entry.area) return AREA_ICONS[entry.area];
  // Without a studio, "/" is the platform's list of studios.
  if (entry.path === '/' && entry.items[0]?.sectionKey === 'platform') return Building2;
  return PATH_ICONS[entry.path] ?? Home;
}

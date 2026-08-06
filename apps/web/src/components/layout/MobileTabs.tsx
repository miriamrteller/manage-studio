import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/hooks/useLanguage';

export interface MobileTab {
  id: string;
  label: string;
  labelHe?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: number;
  href: string;
}

export interface MobileTabsProps {
  tabs: MobileTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
}

export function MobileTabs({
  tabs,
  activeTab,
  onTabChange,
  className = '',
}: MobileTabsProps) {
  const { language } = useLanguage();
  const isHebrew = language === 'he';

  return (
    <nav
      aria-label="Mobile navigation"
      className={`md:hidden fixed bottom-0 left-0 right-0 w-full bg-[--surface-raised] border-t border-[--border-subtle] z-50 ${className}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-stretch justify-around">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const Icon = tab.icon;
          const displayLabel = isHebrew && tab.labelHe ? tab.labelHe : tab.label;

          return (
            <Link
              key={tab.id}
              to={tab.href}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onTabChange(tab.id)}
              className={`
                relative flex flex-col items-center justify-center flex-1 min-h-[48px] px-2 py-1
                text-xs font-medium transition-colors duration-200
                ${isActive
                  ? 'text-[--color-primary] border-t-2 border-[--color-primary] -mt-[2px]'
                  : 'text-[--text-muted] hover:text-[--text-primary] border-t-2 border-transparent'
                }
              `}
            >
              <span className="relative">
                <Icon size={20} className="mb-0.5" />
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span
                    className="absolute -top-1 -right-1 rtl:-right-auto rtl:-left-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full"
                    aria-label={`${tab.badge} notifications`}
                  >
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </span>
              <span className="truncate max-w-full">{displayLabel}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default MobileTabs;
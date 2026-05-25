import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { NavItem } from './navigationConfig';

interface DropdownMenuProps {
  item: NavItem;
  isVisible: boolean;
}

/**
 * DropdownMenu: Reusable dropdown for nested navigation items
 * 
 * Features:
 * - Click to toggle open/close
 * - Keyboard navigation: Enter/Space to toggle, Escape to close
 * - Auto-close when sub-item is clicked
 * - Accessible ARIA attributes
 */
export function DropdownMenu({ item, isVisible }: DropdownMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen(!isOpen);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const handleSubItemClick = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  if (!isVisible) {
    return null;
  }

  const hasDropdown = item.dropdownItems && item.dropdownItems.length > 0;

  return (
    <div className="relative">
      {/* Parent Button / Link */}
      <Button
        ref={buttonRef}
        variant="ghost"
        onClick={() => (hasDropdown ? setIsOpen(!isOpen) : navigate(item.path))}
        onKeyDown={handleKeyDown}
        className="text-on-primary hover:bg-primary-hover hover:text-on-primary focus-visible:outline-2 outline-on-primary outline-offset-2 transition-colors flex items-center gap-1"
        aria-label={t(item.labelKey)}
        aria-expanded={hasDropdown ? isOpen : undefined}
        aria-haspopup={hasDropdown ? 'true' : undefined}
      >
        {t(item.labelKey)}
        {hasDropdown && (
          <span
            className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            ▼
          </span>
        )}
      </Button>

      {/* Dropdown Menu */}
      {hasDropdown && isOpen && item.dropdownItems && (
        <div
          ref={menuRef}
          className="absolute top-full left-0 mt-1 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded shadow-lg z-50 min-w-max"
          role="menu"
          aria-label={`${t(item.labelKey)} submenu`}
        >
          {item.dropdownItems.map((subItem) => (
            <Button
              key={subItem.path}
              variant="ghost"
              onClick={() => handleSubItemClick(subItem.path)}
              className="w-full text-left px-4 py-2 text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)] hover:text-primary focus-visible:bg-[var(--color-surface-secondary)] focus-visible:outline-2 outline-primary outline-offset-0 transition-colors text-sm"
              role="menuitem"
              aria-label={t(subItem.labelKey)}
            >
              {t(subItem.labelKey)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

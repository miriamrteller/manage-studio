export interface WhatsAppButtonProps {
  phoneNumber: string;
  message?: string;
  variant?: 'floating' | 'inline' | 'compact';
  className?: string;
}

function cleanPhoneNumber(phone: string): string {
  // Strip spaces, dashes, and parentheses
  let cleaned = phone.replace(/[\s\-()]/g, '');
  
  // If starts with 0, replace with 972
  if (cleaned.startsWith('0')) {
    cleaned = '972' + cleaned.slice(1);
  }
  // If starts with +972, strip the +
  else if (cleaned.startsWith('+972')) {
    cleaned = cleaned.slice(1);
  }
  // If starts with +, strip it (for other country codes)
  else if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }
  
  return cleaned;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
      <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.878-1.426A9.96 9.96 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" />
    </svg>
  );
}

export function WhatsAppButton({
  phoneNumber,
  message,
  variant = 'inline',
  className = '',
}: WhatsAppButtonProps) {
  const cleanedNumber = cleanPhoneNumber(phoneNumber);
  
  const url = message
    ? `https://wa.me/${cleanedNumber}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${cleanedNumber}`;

  const baseStyles = 'inline-flex items-center justify-center transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#25D366]';
  
  const variantStyles = {
    floating: 'fixed z-50 w-14 h-14 rounded-full bg-[#25D366] hover:bg-[#20BA5C] text-white shadow-lg hover:shadow-xl',
    inline: 'gap-2 px-4 py-2 rounded-md bg-[#25D366] hover:bg-[#20BA5C] text-white font-medium',
    compact: 'w-10 h-10 rounded-full bg-[#25D366] hover:bg-[#20BA5C] text-white',
  };

  const floatingPosition = variant === 'floating' 
    ? { bottom: '1.5rem', insetInlineEnd: '1.5rem' } 
    : {};

  const iconSize = variant === 'floating' ? 'w-7 h-7' : variant === 'compact' ? 'w-5 h-5' : 'w-5 h-5';

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contact via WhatsApp"
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      style={floatingPosition}
    >
      <WhatsAppIcon className={iconSize} />
      {variant === 'inline' && <span>WhatsApp</span>}
    </a>
  );
}

export default WhatsAppButton;

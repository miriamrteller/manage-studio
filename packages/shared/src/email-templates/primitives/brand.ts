import { createContext, useContext } from 'react';
import type { EmailBrand } from '../../email/brand.js';

/**
 * Gradient colours for the email being rendered, or null for the flat primary
 * colour (the look every email had before). BaseEmailTemplate provides it; only
 * emails that opt in with `gradient` get a value.
 */
export const EmailBrandContext = createContext<EmailBrand | null>(null);
export const useEmailBrand = (): EmailBrand | null => useContext(EmailBrandContext);

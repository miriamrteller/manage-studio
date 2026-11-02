/* @ts-self-types="./brand.d.ts" */
import { createContext, useContext } from 'react';
/**
 * Gradient colours for the email being rendered, or null for the flat primary
 * colour (the look every email had before). BaseEmailTemplate provides it; only
 * emails that opt in with `gradient` get a value.
 */
export const EmailBrandContext = createContext(null);
export const useEmailBrand = () => useContext(EmailBrandContext);

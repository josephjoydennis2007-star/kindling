/** Locale-aware money formatter that reads settings.currency from the store. */
import { useAppStore } from '@/store/useAppStore';

export function formatMoney(n: number, override?: string): string {
  const settings = useAppStore.getState().settings as any;
  const code = override || settings.currency || 'USD';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(Math.round(Number(n) || 0));
  } catch {
    return `${code} ${Math.round(Number(n) || 0).toLocaleString()}`;
  }
}

export const CURRENCY_OPTIONS: { code: string; name: string }[] = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'NGN', name: 'Nigerian Naira' },
  { code: 'ZAR', name: 'South African Rand' },
];

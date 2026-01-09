import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge Tailwind CSS classes conditionally
 * Combines clsx for conditional classes and tailwind-merge for proper class merging
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
} 
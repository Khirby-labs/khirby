import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn-style class combinator — merge Tailwind classes without duplicates */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

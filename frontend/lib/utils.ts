import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatINR(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN')}`
}

export function dayLabel(day: number) {
  return `Day ${day}`
}

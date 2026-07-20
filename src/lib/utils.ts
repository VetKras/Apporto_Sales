import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  // Sub-dollar per-unit prices (e.g. ExamSpace Container at $0.099/student/year) round to $0 at
  // whole-dollar precision and lose all meaning — give those extra decimals, keep everything else
  // (contract totals, ACV) as clean whole dollars.
  const fractionDigits = amount !== 0 && Math.abs(amount) < 1 ? 3 : 0
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(amount)
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`
}

export function authorityColor(level: number): string {
  switch (level) {
    case 4: return 'bg-brand-100 text-brand-800 border-brand-200'
    case 3: return 'bg-emerald-50 text-emerald-800 border-emerald-200'
    case 2: return 'bg-neutral-100 text-neutral-700 border-neutral-200'
    default: return 'bg-neutral-50 text-neutral-500 border-neutral-200'
  }
}

export function approvalColor(level: string): string {
  switch (level) {
    case 'Sales': return 'text-emerald-700'
    case 'Manager': return 'text-amber-700'
    case 'VP': return 'text-orange-700'
    default: return 'text-red-700'
  }
}

import type { ScanGrade } from '@vibe-check/shared'

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function formatGrade(grade: ScanGrade): string {
  return grade
}

export function gradeClass(grade: ScanGrade): string {
  if (grade === 'A+' || grade === 'A') return 'grade-a-plus'
  if (grade === 'B+' || grade === 'B') return 'grade-b-plus'
  if (grade === 'C+' || grade === 'C') return 'grade-c-plus'
  return 'grade-d'
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

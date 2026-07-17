'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEPS = [
  { number: 1, label: 'Details' },
  { number: 2, label: 'Services' },
  { number: 3, label: 'Pricing' },
  { number: 4, label: 'Terms' },
  { number: 5, label: 'T&C' },
  { number: 6, label: 'Signatories' },
  { number: 7, label: 'Review' },
]

type Props = {
  currentStep: number
  onStepClick: (step: number) => void
}

export function StepIndicator({ currentStep, onStepClick }: Props) {
  return (
    <nav aria-label="Proposal wizard steps" className="w-full">
      {/* Desktop */}
      <ol className="hidden sm:flex items-center gap-1">
        {STEPS.map((step, idx) => {
          const isComplete = step.number < currentStep
          const isCurrent = step.number === currentStep
          return (
            <li key={step.number} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => onStepClick(step.number)}
                className={cn(
                  'flex items-center gap-2 min-h-[44px] px-2 py-2 rounded-[var(--radius-sm)] transition-colors text-sm font-medium',
                  isCurrent && 'bg-[var(--color-accent-light)] text-[var(--color-accent)]',
                  isComplete && 'text-[var(--color-success)] hover:bg-green-50',
                  !isCurrent && !isComplete && 'text-[var(--color-muted)] hover:bg-slate-50',
                )}
                aria-current={isCurrent ? 'step' : undefined}
                title={step.label}
              >
                <span
                  className={cn(
                    'flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold shrink-0 border',
                    isCurrent && 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]',
                    isComplete && 'bg-[var(--color-success)] text-white border-[var(--color-success)]',
                    !isCurrent && !isComplete && 'bg-white text-[var(--color-muted)] border-[var(--color-border)]',
                  )}
                >
                  {isComplete ? <Check size={14} /> : step.number}
                </span>
                {/* Only the active step shows its label — keeps all 7 steps on one row without scrolling */}
                {isCurrent && <span className="whitespace-nowrap">{step.label}</span>}
              </button>
              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    'h-px flex-1 mx-1 min-w-[12px]',
                    step.number < currentStep ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]',
                  )}
                />
              )}
            </li>
          )
        })}
      </ol>

      {/* Mobile */}
      <div className="sm:hidden flex items-center justify-between px-1">
        <span className="text-sm font-medium text-[var(--color-primary)]">
          Step {currentStep} of {STEPS.length}
        </span>
        <span className="text-sm text-[var(--color-muted)]">
          {STEPS[currentStep - 1].label}
        </span>
      </div>
      <div className="sm:hidden flex gap-1 mt-2">
        {STEPS.map((step) => (
          <button
            key={step.number}
            type="button"
            onClick={() => onStepClick(step.number)}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              step.number < currentStep && 'bg-[var(--color-success)]',
              step.number === currentStep && 'bg-[var(--color-accent)]',
              step.number > currentStep && 'bg-[var(--color-border)]',
            )}
            aria-label={`Go to step ${step.number}: ${step.label}`}
          />
        ))}
      </div>
    </nav>
  )
}

'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { type UseFormReturn } from 'react-hook-form'
import { type ProposalFormData } from '@/lib/validations/proposals'
import { saveProposalDraft } from '@/lib/actions/proposals'

const AUTO_SAVE_INTERVAL = 30_000 // 30 seconds

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function useAutoSave(
  form: UseFormReturn<ProposalFormData>,
  proposalId: string | null,
  onSaved: () => void,
) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const proposalIdRef = useRef(proposalId)
  const dirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Keep ref in sync
  useEffect(() => {
    proposalIdRef.current = proposalId
  }, [proposalId])

  // Watch for form changes to mark dirty
  useEffect(() => {
    const subscription = form.watch(() => {
      dirtyRef.current = true
    })
    return () => subscription.unsubscribe()
  }, [form])

  const doAutoSave = useCallback(async () => {
    if (!dirtyRef.current) return

    dirtyRef.current = false
    setStatus('saving')

    try {
      const values = form.getValues()
      const result = await saveProposalDraft(proposalIdRef.current, values)

      if ('error' in result) {
        setStatus('error')
        return
      }

      if (!proposalIdRef.current) {
        proposalIdRef.current = result.proposalId
        onSaved()
      }

      setStatus('saved')
      setLastSavedAt(new Date())
    } catch {
      setStatus('error')
    }
  }, [form, onSaved])

  // Set up interval
  useEffect(() => {
    timerRef.current = setInterval(doAutoSave, AUTO_SAVE_INTERVAL)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [doAutoSave])

  return { status, lastSavedAt }
}

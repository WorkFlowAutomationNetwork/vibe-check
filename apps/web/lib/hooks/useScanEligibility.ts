'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ScanEligibility {
  allowedScanTypes: string[]
  isAdmin: boolean
  loading: boolean
}

const DEFAULT_STATE: ScanEligibility = { allowedScanTypes: ['passive'], isAdmin: false, loading: true }

export function useScanEligibility(): ScanEligibility {
  const [state, setState] = useState<ScanEligibility>(DEFAULT_STATE)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setState(s => ({ ...s, loading: false }))
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('plan, is_admin')
        .eq('id', user.id)
        .single()

      const plan = profile?.plan ?? 'free'
      const isAdmin = profile?.is_admin ?? false

      const { data: limits } = await supabase
        .from('plan_limits')
        .select('allowed_scan_types')
        .eq('plan', plan)
        .single()

      setState({
        allowedScanTypes: limits?.allowed_scan_types ?? ['passive'],
        isAdmin,
        loading: false,
      })
    })
  }, [])

  return state
}

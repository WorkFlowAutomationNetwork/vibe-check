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

      // my_entitlements computes the *effective* plan (an expired Starter
      // purchase reads back as 'free' — see migration 20260701000030), so
      // this always matches what the scans-insert RLS policy will actually allow.
      const { data: entitlements } = await supabase
        .from('my_entitlements')
        .select('allowed_scan_types, is_admin')
        .single()

      setState({
        allowedScanTypes: entitlements?.allowed_scan_types ?? ['passive'],
        isAdmin: entitlements?.is_admin ?? false,
        loading: false,
      })
    })
  }, [])

  return state
}

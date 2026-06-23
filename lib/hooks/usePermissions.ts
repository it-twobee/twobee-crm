'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, RolePermission, PermissionSection, PermissionAction } from '@/lib/types/database'
import { hasPermission, isSuperAdmin } from '@/lib/permissions'

export function usePermissions() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [perms, setPerms] = useState<RolePermission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const [{ data: p }, { data: rp }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('role_permissions').select('*'),
      ])
      setProfile(p as Profile)
      setPerms((rp ?? []) as RolePermission[])
      setLoading(false)
    }
    load()
  }, [])

  const can = (section: PermissionSection, action: PermissionAction): boolean => {
    if (loading) return false
    return hasPermission(profile, perms, section, action)
  }

  return { profile, perms, loading, can, isSuperAdmin: isSuperAdmin(profile) }
}

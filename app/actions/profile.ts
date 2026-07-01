'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export async function saveOnboarding(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return redirect('/login')
  }

  const experience_level   = (formData.get('experience_level') as string ?? '').trim().slice(0, 50);
  const preferred_wrappers = (formData.getAll('preferred_wrappers') as string[]).slice(0, 10).map(w => String(w).slice(0, 50));
  const city               = (formData.get('city') as string ?? '').trim().slice(0, 100);

  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      experience_level,
      preferred_wrappers,
      city,
      onboarding_completed: true,
    })

  if (error) {
    return redirect(`/onboarding?error=${encodeURIComponent(error.message)}`)
  }

  return redirect('/dashboard')
}

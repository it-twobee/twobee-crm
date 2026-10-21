'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Suspense } from 'react'
import { Loader2, Eye, EyeOff, User, Mail, Lock, CheckCircle2, Camera } from 'lucide-react'
import { AVATAR_BUCKET, AVATAR_LATO, AVATAR_MAX_ORIGINALE, ritaglioQuadrato, percorsoAvatar, percorsoDaLink } from '@/lib/avatar'
import { BackLink } from '@/components/shared/BackLink'
import type { Profile } from '@/lib/types/database'
import Link from 'next/link'
import { SUPER_ADMIN_EMAILS, ROLE_LABELS } from '@/lib/permissions'

interface Props { profile: Profile; userEmail: string }

const ic = 'w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-gold/50 transition-colors'

/* §482 — WebP dove il browser lo sa scrivere; Safari meno recente restituisce
   un PNG senza dirlo, e lì si ripiega sul JPEG. */
async function preparaFoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) throw new Error('Formato non leggibile: usa una foto JPG, PNG o WebP')
  const { sx, sy, lato } = ritaglioQuadrato(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = AVATAR_LATO
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Il browser non riesce a preparare la foto')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, sx, sy, lato, lato, 0, 0, AVATAR_LATO, AVATAR_LATO)
  bmp.close()
  const comeBlob = (type: string) => new Promise<Blob | null>(r => canvas.toBlob(r, type, 0.85))
  const webp = await comeBlob('image/webp')
  if (webp?.type === 'image/webp') return webp
  const jpg = await comeBlob('image/jpeg')
  if (!jpg) throw new Error('Il browser non riesce a preparare la foto')
  return jpg
}

export function ProfiloClient({ profile, userEmail }: Props) {
  const router = useRouter()
  const [avatar, setAvatar] = useState(profile.avatar_url)
  const [savingAvatar, setSavingAvatar] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(profile.full_name)
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [savingProfile, setSavingProfile] = useState(false)

  const [newEmail, setNewEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [savingPw, setSavingPw] = useState(false)

  const isGod = SUPER_ADMIN_EMAILS.includes(profile.email)

  /* §482 — la foto nuova si carica, poi si scrive nel profilo, e solo allora
     si toglie la vecchia: se il secondo passo fallisce si toglie la nuova, e
     il profilo non punta mai a un file che non c'è. */
  const caricaFoto = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Scegli un\'immagine'); return }
    if (file.size > AVATAR_MAX_ORIGINALE) { toast.error('Immagine troppo grande: massimo 15 MB'); return }
    setSavingAvatar(true)
    try {
      const blob = await preparaFoto(file)
      const supabase = createClient()
      const path = percorsoAvatar(profile.id, Date.now(), blob.type === 'image/webp' ? 'webp' : 'jpg')
      const { error: e1 } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' })
      if (e1) throw new Error(/bucket not found/i.test(e1.message) ? 'Manca la migration della foto profilo' : e1.message)
      const url = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl
      const { error: e2 } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
      if (e2) {
        await supabase.storage.from(AVATAR_BUCKET).remove([path])
        throw new Error(e2.message)
      }
      const vecchia = percorsoDaLink(avatar)
      if (vecchia) await supabase.storage.from(AVATAR_BUCKET).remove([vecchia])
      setAvatar(url)
      router.refresh()
      toast.success('Foto aggiornata')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Caricamento non riuscito')
    } finally {
      setSavingAvatar(false)
    }
  }

  const togliFoto = async () => {
    if (!confirm('Togliere la foto? Al suo posto tornano le iniziali.')) return
    setSavingAvatar(true)
    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id)
    if (!error) {
      const vecchia = percorsoDaLink(avatar)
      if (vecchia) await supabase.storage.from(AVATAR_BUCKET).remove([vecchia])
    }
    setSavingAvatar(false)
    if (error) { toast.error(error.message); return }
    setAvatar(null)
    router.refresh()
    toast.success('Foto tolta')
  }

  const saveProfile = async () => {
    setSavingProfile(true)
    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({ full_name: name, phone: phone || null }).eq('id', profile.id)
    setSavingProfile(false)
    if (error) { toast.error(error.message); return }
    toast.success('Profilo aggiornato')
  }

  const changeEmail = async () => {
    if (!newEmail.trim()) return
    setSavingEmail(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
    setSavingEmail(false)
    if (error) { toast.error(error.message); return }
    setEmailSent(true)
    toast.success('Controlla la nuova email per confermare il cambio')
  }

  const changePassword = async () => {
    if (newPw !== confirmPw) { toast.error('Le password non coincidono'); return }
    if (newPw.length < 8) { toast.error('Minimo 8 caratteri'); return }
    setSavingPw(true)
    const supabase = createClient()
    // Verifica prima la password attuale facendo un sign-in silenzioso
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: userEmail, password: currentPw })
    if (signInErr) { setSavingPw(false); toast.error('Password attuale non corretta'); return }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setSavingPw(false)
    if (error) { toast.error(error.message); return }
    setCurrentPw(''); setNewPw(''); setConfirmPw('')
    toast.success('Password aggiornata!')
  }

  const sendResetEmail = async () => {
    const supabase = createClient()
    await supabase.auth.resetPasswordForEmail(userEmail, { redirectTo: `${window.location.origin}/reset-password` })
    toast.success('Email di reset inviata — controlla la casella')
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Suspense fallback={null}>
          <BackLink fallback="/impostazioni" label="Impostazioni"
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary w-fit" />
        </Suspense>
        <div>
          <h1 className="text-2xl font-black text-text-primary">Il mio profilo</h1>
          <p className="text-text-secondary text-sm">{userEmail}</p>
        </div>
      </div>

      {/* Avatar + ruolo */}
      <div className="flex items-center gap-4 mb-8 bg-surface border border-border rounded-xl p-5">
        <div className="relative shrink-0">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={savingAvatar}
            aria-label={avatar ? 'Cambia la foto profilo' : 'Carica una foto profilo'}
            className="w-16 h-16 rounded-full bg-gold/20 border-2 border-gold/40 hover:border-gold flex items-center justify-center text-2xl font-black text-gold-text overflow-hidden transition-colors disabled:opacity-60">
            {avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatar} alt="" className="w-full h-full object-cover" />
              : profile.full_name[0]?.toUpperCase()}
          </button>
          <span aria-hidden="true"
            className="pointer-events-none absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-gold text-on-gold border-2 border-surface flex items-center justify-center">
            {savingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          </span>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) caricaFoto(f) }} />
        </div>
        <div>
          <p className="text-lg font-bold text-text-primary">{profile.full_name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gold/20 text-gold-text">
              {isGod ? '👑 Super Admin' : ROLE_LABELS[profile.app_role] ?? profile.role}
            </span>
            {profile.area && <span className="text-xs text-text-secondary capitalize">{profile.area}</span>}
            {profile.job_title && <span className="text-xs text-text-secondary">· {profile.job_title}</span>}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={savingAvatar}
              className="text-xs font-semibold text-gold-text hover:opacity-80 disabled:opacity-40">
              {avatar ? 'Cambia foto' : 'Carica una foto'}
            </button>
            {avatar && (
              <button type="button" onClick={togliFoto} disabled={savingAvatar}
                className="text-xs text-text-secondary hover:text-error disabled:opacity-40">
                Togli
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Info base */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-gold-text" />
            <h2 className="text-sm font-bold text-text-primary">Informazioni personali</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Nome completo</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={ic} placeholder="Nome Cognome" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Telefono</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={ic} placeholder="+39 340 000 0000" />
            </div>
          </div>
          <button onClick={saveProfile} disabled={savingProfile} className="mt-4 flex items-center gap-2 bg-gold text-on-gold text-sm font-bold px-4 py-2 rounded-lg hover:bg-gold/90 disabled:opacity-50">
            {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Salva
          </button>
        </div>

        {/* Cambio email */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-4 h-4 text-gold-text" />
            <h2 className="text-sm font-bold text-text-primary">Cambia email</h2>
          </div>
          <p className="text-xs text-text-secondary mb-3">Email attuale: <strong className="text-text-primary">{userEmail}</strong></p>
          {emailSent ? (
            <div className="flex items-center gap-2 text-sm text-success bg-success/10 border border-success/20 rounded-lg px-4 py-3">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> Controlla la nuova email per confermare il cambio.
            </div>
          ) : (
            <div className="flex gap-2">
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={ic} placeholder="nuova@email.com" />
              <button onClick={changeEmail} disabled={savingEmail || !newEmail}
                className="shrink-0 bg-gold text-on-gold text-sm font-bold px-4 py-2 rounded-lg hover:bg-gold/90 disabled:opacity-50 flex items-center gap-1">
                {savingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aggiorna'}
              </button>
            </div>
          )}
        </div>

        {/* Cambio password */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-gold-text" />
              <h2 className="text-sm font-bold text-text-primary">Cambia password</h2>
            </div>
            <button onClick={sendResetEmail} className="text-xs text-text-secondary hover:text-gold-text transition-colors">
              Ricevi link via email →
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Password attuale</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className={ic} placeholder="••••••••" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Nuova password</label>
              <input type={showPw ? 'text' : 'password'} value={newPw} onChange={(e) => setNewPw(e.target.value)} className={ic} placeholder="Min. 8 caratteri" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Conferma nuova password</label>
              <input type={showPw ? 'text' : 'password'} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                className={`${ic} ${confirmPw && confirmPw !== newPw ? 'border-error/50' : ''}`} placeholder="••••••••" />
              {confirmPw && confirmPw !== newPw && <p className="text-xs text-error mt-1">Le password non coincidono</p>}
            </div>
          </div>
          <button onClick={changePassword} disabled={savingPw || !currentPw || !newPw || !confirmPw}
            className="mt-4 flex items-center gap-2 bg-gold text-on-gold text-sm font-bold px-4 py-2 rounded-lg hover:bg-gold/90 disabled:opacity-50">
            {savingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Aggiorna password
          </button>
        </div>
      </div>
    </div>
  )
}

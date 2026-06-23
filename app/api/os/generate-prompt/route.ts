import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import fs from 'fs'
import path from 'path'

const CATEGORY_LABEL: Record<string, string> = {
  costruire: 'COSTRUIRE (nuovo codice)',
  modificare: 'MODIFICARE (cambia comportamento esistente)',
  ottimizzare: 'OTTIMIZZARE (stessa funzionalità, meglio)',
  eliminare: 'ELIMINARE (rimuovi senza rompere niente)',
}

const PRIORITY_LABEL: Record<string, string> = {
  critica: 'CRITICA 🔴',
  alta: 'ALTA 🟠',
  media: 'MEDIA 🟡',
  bassa: 'BASSA ⚪',
}

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', '.turbo', 'coverage', '.supabase'])
const KEEP_EXT  = new Set(['.ts', '.tsx', '.js', '.jsx', '.sql', '.md'])

function collectFiles(dir: string, depth = 0, maxDepth = 4): string[] {
  if (depth > maxDepth) return []
  let items: string[]
  try { items = fs.readdirSync(dir) } catch { return [] }
  const out: string[] = []
  for (const item of items) {
    if (SKIP_DIRS.has(item) || item.startsWith('.')) continue
    const abs = path.join(dir, item)
    let stat: fs.Stats
    try { stat = fs.statSync(abs) } catch { continue }
    if (stat.isDirectory()) {
      out.push(...collectFiles(abs, depth + 1, maxDepth))
    } else if (KEEP_EXT.has(path.extname(item))) {
      out.push(path.relative(process.cwd(), abs))
    }
  }
  return out
}

function safeRead(relPath: string): string | null {
  try {
    const abs = path.join(process.cwd(), relPath)
    if (!fs.existsSync(abs)) return null
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) {
      const files = fs.readdirSync(abs).filter(f => KEEP_EXT.has(path.extname(f)))
      return `[Directory — file: ${files.join(', ')}]`
    }
    const lines = fs.readFileSync(abs, 'utf-8').split('\n')
    if (lines.length > 300) return lines.slice(0, 300).join('\n') + '\n\n[... file troncato a 300 righe ...]'
    return lines.join('\n')
  } catch {
    return null
  }
}

function findClosestFile(name: string, realFiles: string[]): string | null {
  const base = path.basename(name)
  const exact = realFiles.find(f => path.basename(f) === base)
  if (exact) return exact
  const stemMatch = realFiles.find(f => path.basename(f, path.extname(f)) === path.basename(name, path.extname(name)))
  return stemMatch ?? null
}

function getExt(p: string) {
  return path.extname(p).replace('.', '') || 'txt'
}

function claudeRules(): string {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'CLAUDE.md'), 'utf-8')
    const sections = ['## Stack', '## Convenzioni codice', '## Pattern ricorrenti', '## Autenticazione e ruoli']
    const lines = raw.split('\n')
    let capturing = false
    const result: string[] = []
    for (const line of lines) {
      if (sections.some(s => line.startsWith(s))) { capturing = true }
      else if (line.startsWith('## ') && !sections.some(s => line.startsWith(s))) { capturing = false }
      if (capturing) result.push(line)
      if (result.length > 80) break
    }
    return result.join('\n')
  } catch {
    return '- Next.js 14 App Router, TypeScript strict, Tailwind CSS, Supabase\n- Zero errori TypeScript al primo tentativo\n- Modifica solo le righe necessarie'
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('email').eq('id', user.id).single()
  if (!profile || !SUPER_ADMIN_EMAILS.includes(profile.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { task } = await req.json()
  const { title, description, category, priority, notes, file_paths, related_files } = task

  const rules = claudeRules()
  const realFiles = collectFiles(process.cwd())

  // Build file blocks — if file missing, try to find closest real file and note the discrepancy
  const fileBlocks: string[] = []
  for (const fp of (file_paths ?? [])) {
    const norm = fp.replace(/^\//, '')
    const content = safeRead(norm)
    if (content) {
      fileBlocks.push(`### \`${norm}\`\n\`\`\`${getExt(norm)}\n${content}\n\`\`\``)
    } else {
      const closest = findClosestFile(norm, realFiles)
      if (closest && closest !== norm) {
        const closestContent = safeRead(closest)
        fileBlocks.push(
          `### \`${norm}\`\n> ⚠️ Path non trovato nel progetto. File più simile trovato: \`${closest}\` — usa quello.\n\n\`\`\`${getExt(closest)}\n${closestContent ?? ''}\n\`\`\``
        )
      } else {
        const dir = path.dirname(norm)
        const absDir = path.join(process.cwd(), dir)
        const dirExists = fs.existsSync(absDir) && fs.statSync(absDir).isDirectory()
        fileBlocks.push(
          `### \`${norm}\`\n> ⚠️ File non trovato. ${dirExists ? `La directory \`${dir}/\` esiste — crea il file lì.` : `La directory \`${dir}/\` NON esiste. Controlla la struttura del progetto prima di creare.`}`
        )
      }
    }
  }

  const relatedBlock = (related_files ?? []).length > 0
    ? (related_files as string[]).map((f: string) => {
        const norm = f.replace(/^\//, '')
        const exists = fs.existsSync(path.join(process.cwd(), norm))
        return exists ? `- \`${norm}\`` : `- \`${norm}\` _(verifica path — non trovato)_`
      }).join('\n')
    : '_Nessuno specificato_'

  // Snapshot della struttura reale per orientare Claude Code
  const structureSnapshot = [
    'app/(dashboard)/ → pagine principali (dashboard, clienti, progetti, commerciale, ecc.)',
    'components/dashboard/ → widget dashboard',
    'components/clients/tabs/ → tab pagina cliente',
    'components/projects/ → ProjectPageClient e tab progetto',
    'components/commerciale/ → sezione commerciale (deals, leads)',
    'components/shared/ → Sidebar, TopBar, ecc.',
    'components/os/ → TwoBee OS (Command Center)',
    'lib/types/database.ts → TUTTI i tipi TypeScript del progetto',
    'lib/supabase/ → client.ts, server.ts, admin.ts',
    'app/actions/ → Server Actions (use server)',
    'app/api/ai/ → route Groq AI',
    'app/api/os/ → route TwoBee OS',
    'supabase/migrations/ → migration SQL (ultima: 054)',
  ].join('\n')

  const prompt = `# Task per Claude Code

**Tipo:** ${CATEGORY_LABEL[category] ?? category.toUpperCase()}
**Priorità:** ${PRIORITY_LABEL[priority] ?? priority.toUpperCase()}

---

## Cosa fare
${title}

## Descrizione
${description ?? '_Nessuna descrizione aggiuntiva._'}

${notes ? `## Note aggiuntive\n${notes}\n` : ''}
---

## Struttura progetto (riferimento obbligatorio)
\`\`\`
${structureSnapshot}
\`\`\`

## File da modificare
${fileBlocks.length > 0 ? fileBlocks.join('\n\n') : '_Nessun file specificato — usa il tuo giudizio basandoti sulla struttura sopra._'}

## File collegati (dipendenze — non rompere)
${relatedBlock}

---

## Regole di progetto (da CLAUDE.md — rispetta sempre)
${rules}
`

  return NextResponse.json({ prompt })
}

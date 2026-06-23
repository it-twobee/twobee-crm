import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import fs from 'fs'
import path from 'path'

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', '.turbo', 'coverage', '__pycache__', '.supabase'])
const KEEP_EXT  = new Set(['.ts', '.tsx', '.js', '.jsx', '.sql', '.md', '.json'])

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
    const rel = path.relative(process.cwd(), abs)
    if (stat.isDirectory()) {
      out.push(...collectFiles(abs, depth + 1, maxDepth))
    } else if (KEEP_EXT.has(path.extname(item))) {
      out.push(rel)
    }
  }
  return out
}

function fileTree(dir: string, depth = 0, maxDepth = 3): string[] {
  if (depth > maxDepth) return []
  let items: string[]
  try { items = fs.readdirSync(dir) } catch { return [] }
  const out: string[] = []
  for (const item of items) {
    if (SKIP_DIRS.has(item) || item.startsWith('.')) continue
    const abs = path.join(dir, item)
    let stat: fs.Stats
    try { stat = fs.statSync(abs) } catch { continue }
    const rel = path.relative(process.cwd(), abs)
    const indent = '  '.repeat(depth)
    if (stat.isDirectory()) {
      out.push(`${indent}📁 ${rel}/`)
      out.push(...fileTree(abs, depth + 1, maxDepth))
    } else if (KEEP_EXT.has(path.extname(item))) {
      out.push(`${indent}${rel}`)
    }
  }
  return out
}

function tokenize(title: string): Set<string> {
  return new Set(
    title.toLowerCase()
      .replace(/[→\-\/\.]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
  )
}

function isTooSimilar(candidate: string, existing: string[]): boolean {
  const cTokens = tokenize(candidate)
  for (const ex of existing) {
    const eTokens = tokenize(ex)
    const intersection = Array.from(cTokens).filter(w => eTokens.has(w)).length
    const union = new Set(Array.from(cTokens).concat(Array.from(eTokens))).size
    if (union > 0 && intersection / union >= 0.55) return true
  }
  return false
}

function validatePaths(paths: string[], realFiles: Set<string>): string[] {
  return paths.map(p => {
    const norm = p.replace(/^\//, '')
    if (realFiles.has(norm)) return norm
    // Check if it's a valid directory path
    const absDir = path.join(process.cwd(), norm)
    if (fs.existsSync(absDir) && fs.statSync(absDir).isDirectory()) return norm
    // Find closest real match
    const base = path.basename(norm)
    const candidates = Array.from(realFiles).filter(f => path.basename(f) === base)
    return candidates[0] ?? norm
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('email').eq('id', user.id).single()
  if (!profile || !SUPER_ADMIN_EMAILS.includes(profile.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { existingTasks } = await req.json() as { existingTasks: { title: string }[] }

  let claudeMd = ''
  try { claudeMd = fs.readFileSync(path.join(process.cwd(), 'CLAUDE.md'), 'utf-8').substring(0, 2000) } catch { /* */ }

  const realFiles = new Set(collectFiles(process.cwd()))
  const tree = fileTree(process.cwd()).join('\n')
  const flatList = Array.from(realFiles).join('\n')

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2500,
      messages: [
        {
          role: 'system',
          content: `Sei un tech lead senior che analizza un gestionale B2B Next.js 14.
REGOLA CRITICA: file_paths e related_files devono contenere SOLO path che esistono nell'elenco FILE REALI fornito, oppure path di nuovi file in directory già esistenti.
MAI inventare path. Se un componente si trova in components/commerciale/, non metterlo in app/components/.
Rispondi SOLO con JSON valido, nessun testo fuori dal JSON.`,
        },
        {
          role: 'user',
          content: `Analizza questo progetto e suggerisci 5 task di sviluppo concreti e realistici.

CLAUDE.md:
${claudeMd}

ALBERO FILE (struttura):
${tree.substring(0, 2000)}

FILE REALI (usa SOLO questi path, o sottocartelle già esistenti):
${flatList.substring(0, 3000)}

TASK GIÀ PRESENTI (aperti O completati — NON proporre nulla di simile, nemmeno varianti o miglioramenti dello stesso tema):
${existingTasks.map(t => `- ${t.title}`).join('\n')}

Proponi SOLO task genuinamente nuovi che aggiungono funzionalità o miglioramenti significativi non ancora presenti nel backlog.

REGOLE:
- category: costruire | modificare | ottimizzare | eliminare
- priority: critica | alta | media | bassa
- file_paths: array con path ESATTI dall'elenco FILE REALI sopra (o nuovi file in dir già esistenti)
- related_files: path ESATTI di dipendenze già esistenti
- depends_on_titles: array di titoli di task dal BACKLOG che devono essere completati PRIMA di questo
- implementation_order: numero 1-100 (1=prima, 100=dopo), considerando le dipendenze
- description: 2-3 frasi concrete e tecniche

JSON (array di 5 oggetti):
[
  {
    "category": "costruire",
    "priority": "alta",
    "title": "Titolo breve specifico",
    "description": "Descrizione tecnica",
    "file_paths": ["path/esatto/esistente.tsx"],
    "related_files": ["path/dipendenza.ts"],
    "depends_on_titles": ["Titolo task prerequisito se esiste nel backlog"],
    "implementation_order": 10
  }
]`,
        },
      ],
    }),
  })

  if (!groqRes.ok) return NextResponse.json({ error: 'Groq error' }, { status: 500 })

  const groqData = await groqRes.json()
  const raw = groqData.choices?.[0]?.message?.content ?? '[]'
  try {
    const match = raw.match(/\[[\s\S]*\]/)
    const suggestions = JSON.parse(match?.[0] ?? '[]') as {
      file_paths?: string[]
      related_files?: string[]
      depends_on_titles?: string[]
      implementation_order?: number
      [key: string]: unknown
    }[]

    const existingTitles = existingTasks.map(t => t.title)

    const validated = suggestions
      .filter(s => {
        const title = (s.title as string | undefined) ?? ''
        return title.length > 0 && !isTooSimilar(title, existingTitles)
      })
      .map(s => ({
        ...s,
        file_paths: validatePaths(s.file_paths ?? [], realFiles),
        related_files: validatePaths(s.related_files ?? [], realFiles),
      }))

    return NextResponse.json({ suggestions: validated })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}

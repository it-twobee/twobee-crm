import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const target = (formData.get('target') as string) ?? 'resource_costs'

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  let rows: Record<string, string>[] = []

  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.tsv')) {
    const text = new TextDecoder('utf-8').decode(buffer)
    const wb = XLSX.read(text, { type: 'string' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' })
  } else {
    const wb = XLSX.read(buffer, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' })
  }

  if (rows.length === 0) return NextResponse.json({ error: 'File vuoto o formato non riconosciuto' }, { status: 400 })

  const headers = Object.keys(rows[0])
  const sample = rows.slice(0, 5)

  const systemPrompt = target === 'resource_costs'
    ? `Sei un assistente che mappa dati da un foglio di calcolo alla tabella resource_costs.
Campi target: name, resource_type (internal_employee|external_freelancer|partner|consultant|contractor|agency_supplier), cost_type (monthly_salary|hourly|daily|retainer|project_fee|partner_percentage), role_title, department, monthly_cost, hourly_cost, availability_hours_month (default 160), billable_target_hours_month (default 120), markup_default (default 2), tools_cost_monthly, notes.
Se trovi RAL, moltiplicala per 1.35 per ottenere monthly_cost (e dividi per 12).
Se trovi uno stipendio netto, moltiplicalo per 1.8 per stimare il costo aziendale mensile.`
    : target === 'business_costs'
    ? `Sei un assistente che mappa dati da un foglio di calcolo alla tabella business_costs.
Campi target: category (affitto|software|amministrazione|marketing|personale|formazione|altro), description, monthly_amount (se il dato è annuale, dividilo per 12), is_active (default true), notes.`
    : `Sei un assistente che mappa dati da un foglio di calcolo alla tabella project_cost_entries.
Campi target: category (risorsa|software|provvigione|cac|produzione|indiretto|altro), description, amount, hours, hourly_rate, notes.
Se ci sono ore e tariffa oraria, calcola amount = hours * hourly_rate.`

  const prompt = `Analizza queste colonne del file caricato e mappa ogni riga ai campi target.

COLONNE TROVATE: ${JSON.stringify(headers)}

PRIME 5 RIGHE DI ESEMPIO:
${JSON.stringify(sample, null, 2)}

TOTALE RIGHE: ${rows.length}

Rispondi SOLO con un JSON array di oggetti mappati. Ogni oggetto deve avere i campi target compilati.
Se un campo non è presente nei dati, usa il default o null.
DATI COMPLETI (tutte le ${rows.length} righe):
${JSON.stringify(rows)}`

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 4000,
        messages: [
          { role: 'system', content: systemPrompt + '\nRispondi SOLO con un JSON array valido, senza markdown.' },
          { role: 'user', content: prompt },
        ],
      }),
    })

    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content ?? '[]'
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    const parsed = JSON.parse(jsonMatch?.[0] ?? '[]')

    return NextResponse.json({ rows: parsed, rawHeaders: headers, totalRows: rows.length })
  } catch (err) {
    return NextResponse.json({ error: 'Parsing AI failed', details: String(err) }, { status: 500 })
  }
}

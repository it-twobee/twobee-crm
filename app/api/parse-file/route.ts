import { NextResponse } from 'next/server'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    let text = ''

    if (ext === 'txt' || ext === 'md' || ext === 'text') {
      text = buffer.toString('utf-8')
    } else if (ext === 'docx' || ext === 'doc') {
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else if (ext === 'pdf') {
      const parser = new PDFParse({ data: new Uint8Array(buffer) })
      const result = await parser.getText()
      text = result.text
      await parser.destroy()
    } else {
      return NextResponse.json({ error: `Formato non supportato: .${ext}` }, { status: 400 })
    }

    return NextResponse.json({ text, chars: text.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

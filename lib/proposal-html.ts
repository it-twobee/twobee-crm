import type { ProposalContent, BrandMode } from '@/lib/types/database'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

interface BrandCfg { accent: string; brandHtml: string; footer: string }

function brandConfig(mode: BrandMode, partnerName: string | null): BrandCfg {
  switch (mode) {
    case 'twobee':
      return {
        accent: '#F5C800',
        brandHtml: `<span style="color:#F5C800">TWO</span> BEE`,
        footer: 'TWO BEE · twobee.it',
      }
    case 'partner_branded':
      return {
        accent: '#3B82F6',
        brandHtml: esc(partnerName ?? 'Partner'),
        footer: esc(partnerName ?? ''),
      }
    case 'white_label':
      return {
        accent: '#3B82F6',
        brandHtml: partnerName ? esc(partnerName) : '',
        footer: partnerName ? esc(partnerName) : 'Documento riservato',
      }
    case 'neutral':
      return { accent: '#94A3B8', brandHtml: '', footer: 'Documento riservato' }
  }
}

export function buildProposalHtml(content: ProposalContent, brandMode: BrandMode, partnerName: string | null, targetName: string | null): string {
  const { accent, brandHtml, footer } = brandConfig(brandMode, partnerName)
  const today = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })

  const cover = content.sections[0]
  const rest = content.sections.slice(1)

  const sectionsHtml = rest.map((s, i) => `
  <div class="section${i % 4 === 3 ? ' page-break' : ''}">
    <div class="sec-num">${String(i + 1).padStart(2, '0')}</div>
    <h2>${esc(s.title)}</h2>
    <p class="sec-content">${esc(s.content).replace(/\n/g, '<br/>')}</p>
    ${s.bullets?.length ? `<ul>${s.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
  </div>`).join('')

  const missingHtml = content.missing_data?.length ? `
  <div class="missing no-print">
    <strong>⚠ Dati da completare prima dell'invio:</strong>
    <ul>${content.missing_data.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
  </div>` : ''

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8"/>
<title>${esc(content.title)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#0A0A0A;color:#E5E5E5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.missing{background:#7F1D1D22;border:1px solid #EF444455;border-radius:12px;padding:16px 20px;margin:20px 64px;font-size:12px;color:#FCA5A5}
.missing ul{margin:8px 0 0 18px}
.cover{min-height:100vh;display:flex;flex-direction:column;padding:64px;background:linear-gradient(150deg,#0A0A0A 60%,${accent}0D 100%)}
.brand{font-size:26px;font-weight:900;letter-spacing:-.02em}
.cover-mid{flex:1;display:flex;flex-direction:column;justify-content:center}
.badge{display:inline-block;width:fit-content;border:1px solid ${accent}44;color:${accent};border-radius:100px;padding:5px 14px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:24px}
h1{font-size:46px;font-weight:900;line-height:1.05;letter-spacing:-.02em;max-width:16ch}
.cover-sub{font-size:15px;color:#888;margin-top:16px;max-width:60ch;line-height:1.7}
.cover-target{font-size:13px;color:${accent};margin-top:28px;font-weight:700}
.cover-foot{display:flex;justify-content:space-between;font-size:11px;color:#555;border-top:1px solid #1E1E1E;padding-top:20px}
.section{padding:44px 64px;border-bottom:1px solid #141414}
.sec-num{font-size:11px;font-weight:900;color:${accent};letter-spacing:.15em;margin-bottom:8px}
h2{font-size:22px;font-weight:800;margin-bottom:14px}
.sec-content{font-size:13.5px;line-height:1.85;color:#B8B8B8;max-width:75ch}
ul{margin:14px 0 0 4px;list-style:none}
li{font-size:13px;color:#A8A8A8;padding:6px 0 6px 22px;position:relative;line-height:1.6}
li::before{content:'→';position:absolute;left:0;color:${accent};font-weight:700}
.next{padding:44px 64px}
.next-box{background:${accent}0D;border:1px solid ${accent}33;border-radius:16px;padding:28px 32px}
.foot{padding:28px 64px;display:flex;justify-content:space-between;font-size:11px;color:#444}
@page{size:A4 portrait;margin:0}
@media print{.no-print{display:none!important}.page-break{page-break-before:always}}
.fab{position:fixed;bottom:28px;right:28px;z-index:99;background:${accent};color:#000;font-weight:800;font-size:13px;padding:14px 26px;border:none;border-radius:100px;cursor:pointer;font-family:'Inter',sans-serif}
</style>
</head>
<body>
${missingHtml}
<div class="cover">
  <div class="brand">${brandHtml}</div>
  <div class="cover-mid">
    <div class="badge">Proposta commerciale</div>
    <h1>${esc(content.title)}</h1>
    ${cover ? `<p class="cover-sub">${esc(cover.content)}</p>` : ''}
    ${targetName ? `<div class="cover-target">Preparata per ${esc(targetName)}</div>` : ''}
  </div>
  <div class="cover-foot"><span>${today}</span><span>${footer}</span></div>
</div>
${sectionsHtml}
${content.next_steps?.length ? `
<div class="next">
  <div class="next-box">
    <div class="sec-num">Prossimi step</div>
    <ul>${content.next_steps.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
  </div>
</div>` : ''}
<div class="foot"><span>${footer}</span><span>Documento riservato — non divulgare</span></div>
<button class="fab no-print" onclick="window.print()">🖨&nbsp; Stampa / Salva PDF</button>
</body>
</html>`
}

/**
 * §327 — Quale commit sta girando.
 *
 * «Il redeploy va verificato a mano» era una nota nel manuale, e a mano non si
 * poteva: da fuori si vede solo che l'etag della pagina di login è cambiato,
 * cioè che **un** build è passato — non quale. Dopo sette push in un giorno
 * quella distinzione è tutta la domanda.
 *
 * Lo SHA si legge a build time (`next.config.mjs`), non a runtime: nel
 * container non c'è nessun `.git` da interrogare, e un endpoint che risponde
 * «sconosciuto» in produzione non serve a niente.
 *
 * Non è protetto: uno SHA abbreviato non è un segreto — non apre il
 * repository, non dice cosa contiene — e un endpoint di versione dietro
 * autenticazione non risponde alla domanda per cui esiste, che è «l'ultimo push
 * è arrivato?» fatta prima di aver fatto login.
 */
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({
    sha: process.env.BUILD_SHA ?? 'sconosciuto',
    builtAt: process.env.BUILD_TIME ?? null,
    /* Perché «sconosciuto» non è un errore: in sviluppo il build non passa da
       git, e dirlo evita di andare a cercare un guasto che non c'è. */
    nota: process.env.BUILD_SHA
      ? undefined
      : 'BUILD_SHA non impostata: succede in sviluppo, o se il build non parte da un checkout git',
  })
}

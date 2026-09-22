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
    /* §407 — «sconosciuto» non è un guasto, ma dire soltanto che manca lascia
       chi legge a indovinare dove. In locale lo SHA arriva da `git rev-parse`;
       nel container no, perché `.dockerignore` esclude `.git`: lì può solo
       essere passato al build. Quindi la nota dice **cosa impostare**. */
    nota: process.env.BUILD_SHA
      ? undefined
      : 'BUILD_SHA non impostata. Nel container lo SHA arriva solo dal build: in Coolify aggiungi COOLIFY_GIT_COMMIT (o SOURCE_COMMIT) fra le Build Variable dell\'applicazione. In sviluppo senza git è normale.',
  })
}

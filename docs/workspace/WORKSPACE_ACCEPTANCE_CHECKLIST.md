# WORKSPACE_ACCEPTANCE_CHECKLIST

> I 40 criteri di accettazione (§38) + il perimetro sicurezza (§3). Stato aggiornato
> per fase. ✅ fatto (codice) · 🔶 codice fatto, da testare in-app · ⏳ fase futura.
> "da testare" = build verde ma non ancora verificato end-to-end con utente reale.

## Task domain (Fase 1)
| # | Criterio | Fase | Stato |
|---|---|---|---|
| 1 | Tutte le task usano lo stesso dominio | 1 | 🔶 |
| 2 | Task cliccabili ovunque | 1/4 | 🔶 (dashboard workspace liste → Fase 4) |
| 3 | Drawer condiviso | 1 | 🔶 |
| 4 | Conteggi escludono le completate | 1 | 🔶 |
| 5 | Richieste Admin→Risorsa funzionano | 1 | 🔶 |
| 6 | Richiesta supporto genera task collegata | 1 | 🔶 |

## Calendario (Fase 2)
| 7 | CalendarEventForm unico | 2 | ⏳ |
| 8 | Google Calendar bidirezionale | 2 | ⏳ |
| 9 | Task NON sincronizzate come eventi | 2 | ✅ (già così; da mantenere) |

## Workload + Portfolio (Fase 3)
| 10 | Workload sostituisce Progetti attivi | 3 | ⏳ |
| 11 | Progetti collassabili | 3 | ⏳ |
| 12 | Intensità/sovraccarico su dati reali | 3 | ⏳ |
| 13 | AI Planning non modifica senza conferma | 3 | ⏳ |
| 14 | Portfolio filtra per tipologia | 3 | ⏳ |

## Documenti cliente (Fase 5)
| 15 | Documenti cliente usa solo Drive | 5 | ⏳ |

## Cliente/Progetto (Fase 4)
| 16 | Cliente/progetto hanno quick create contestuale | 4 | ⏳ |
| 17 | "Progetti attivi" è sezione autonoma | 4 | ⏳ |
| 18 | Brief ha view mode ed edit mode | 4 | ⏳ |
| 19 | Gantt collassato di base | 4 | ⏳ |
| 20 | Hover mostra data esatta | 4/3 | ⏳ |
| 21 | Task e milestone aprono drawer | 4 | ⏳ (task già in progetto ✅; milestone/sprint → Fase 4) |
| 22 | Appuntamenti cerca i prossimi 20 giorni | 4 | ⏳ |
| 23 | Matching calendario gestisce nomi parziali | 4 | ⏳ |
| 24 | Riunioni non conserva il file sorgente | 4 | ✅ (già così) / task-gen ⏳ |
| 25 | Task AI modificabili prima della creazione | 4 | ⏳ |
| 26 | Task cliente AI modificabili/selezionabili | 4 | 🔶 (in parte già, refinement §20) |

## Customer Care & nav (Fase 6)
| 27 | Resta solo Customer Care chat | 6 | 🔶 (nav già conforme; deprecare in DB) |
| 30 | AI Customer Care è interna | 6 | ⏳ |
| 31 | Ticket non evidenzia Customer Care | 6 | ⏳ |

## Knowledge (Fase 5)
| 28 | Knowledge strutturata e strategica | 5 | ⏳ |
| 29 | Marginalità Knowledge protetta | 5 | ⏳ |

## HR/Cronologia/Profilo (Fase 7)
| 32 | Richieste HR senza upload documento | 7 | ⏳ |
| 33 | Cronologia permette restore sicuro | 7 | ⏳ (restore base già esiste; reversible/audit ⏳) |
| 34 | Retention senza distruggere audit critici | 7 | ⏳ |
| 35 | Profilo rispetta la griglia | 7 | ⏳ |
| 36 | Email presente | 7 | ✅ (già mostrata; rendere read-only) |
| 37 | Competenze non visibile | 7 | ⏳ |

## Sicurezza & qualità (Fase 0 / 8)
| 38 | Dati economici sensibili non esposti | 0 | ✅ (mig. 100) |
| 39 | Build e typecheck verdi | tutte | ✅ (ad ogni commit) |
| 40 | RLS verificate per ruolo | 0/8 | 🔶 (Fase 0 fatta; verifica per-ruolo completa in Fase 8) |

## Perimetro sicurezza §3 (invariante)
Workspace NON vede: MRR per cliente ✅, fatture ✅, preventivi ✅, marginalità cliente/progetto ✅,
costi risorse ✅, compensi ✅, buste paga altrui ✅, business cost ✅, note founder (documents.visibility) ✅,
anagrafica fiscale ✅, dati economici dettagliati ✅. (Tutti chiusi a livello RLS/query in Fase 0.)
Da confermare in Fase 8 con test per ogni ruolo (manager/senior/junior/stage/freelance/partner/viewer).

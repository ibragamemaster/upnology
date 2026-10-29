import type { Milestone, Offer, Release } from './commercial.ts'

// Mirror the existing RPC prerequisites; the server remains authoritative.
export function milestoneAction(offer: Offer, milestone: Milestone) {
 if (['PAGATO', 'RIMBORSATO', 'RIMBORSO_PARZIALE'].includes(milestone.status)) return { payable: false, reason: 'Esito registrato dal servizio pagamenti.' }
 if (!offer.contract?.accepted_at) return { payable: false, reason: 'Accetta il contratto per abilitare il pagamento iniziale.' }
 if (offer.milestones.some(m => m.phase < milestone.phase && m.status !== 'PAGATO')) return { payable: false, reason: 'In attesa del pagamento delle fasi precedenti.' }
 if (milestone.status === 'BLOCCATO') return { payable: false, reason: 'In attesa della pubblicazione e approvazione della versione di questa fase.' }
 if (milestone.status === 'IN_ATTESA') return { payable: false, reason: 'Pagamento in verifica. Attendi l’esito; non effettuare un nuovo pagamento.' }
 return { payable: ['RICHIESTO', 'FALLITO'].includes(milestone.status), reason: milestone.status === 'FALLITO' ? 'Pagamento non completato: puoi riprovare.' : 'Rata disponibile per il pagamento.' }
}

export function releaseApprovalBlock(offer: Offer, release: Release): string | null {
 const latest = offer.releases.filter(r => r.phase === release.phase).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0]
 if (latest?.id !== release.id) return 'Versione superata: approva la versione più recente di questa fase.'
 if (offer.releases.some(r => r.phase === release.phase && r.feedback.some(f => !f.resolved_at))) return 'Prima dell’approvazione il team deve risolvere i feedback aperti di questa fase.'
 if (!offer.milestones.some(m => m.phase === release.phase - 1 && m.status === 'PAGATO')) return 'In attesa della conferma del pagamento precedente.'
 return null
}

import type { Offer } from '../domain/commercial'

export const readable = (s: string) => s.replaceAll('_', ' ').toLocaleLowerCase('it')

export function paymentDiagnosis(o: Offer) {
 if (o.status !== 'ACCETTATO') return 'Preventivo commerciale non accettato: le rate non sono ancora previste.'
 if (!o.project_id || !o.project) return 'Collegamento al progetto mancante: verifica backend necessaria.'
 if ([1, 2, 3].some(phase => !o.milestones.some(m => m.phase === phase))) return 'Rate mancanti o incomplete: verifica backend necessaria.'
 if (!o.contract) return 'Contratto mancante: verifica backend necessaria.'
 if (!o.contract.accepted_at) return 'Rate create. In attesa dell’accettazione del contratto per abilitare l’avvio.'
 return 'Rate collegate al progetto. Le fasi successive seguono le approvazioni previste dal contratto.'
}

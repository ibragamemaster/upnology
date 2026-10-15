import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { HttpError } from './config.ts'
import type { Offer } from '../src/domain/commercial.ts'
import { euro } from '../src/domain/commercial.ts'

export async function renderDocument(offer: Offer, kind: 'quote' | 'contract') {
 const contract = kind === 'contract' ? offer.contract : null
 if (kind === 'contract' && !contract) throw new Error('Contract unavailable')
 const s = contract?.snapshot ?? offer.snapshot
 const doc = await PDFDocument.create()
 doc.setTitle(`Upnology - ${kind === 'contract' ? 'Contratto' : 'Preventivo'} ${offer.id}`)
 doc.setAuthor('Upnology'); doc.setCreator('Upnology'); doc.setProducer('Upnology')
 doc.setCreationDate(new Date(contract?.created_at ?? offer.created_at)); doc.setModificationDate(new Date(contract?.created_at ?? offer.created_at))
 doc.registerFontkit(fontkit)
 const bytes = await readFile(join(process.cwd(), 'server/assets/DejaVuSans.ttf'))
 const font = await doc.embedFont(bytes, { subset: true })
 const supported = new Set(font.getCharacterSet())
 let page = doc.addPage([595.28, 841.89]), y = 790
 const clean = (value: string) => {
  const text = value.replace(/\t/g, ' ').replace(/\r/g, '')
  for (const ch of text) if (ch !== '\n' && !supported.has(ch.codePointAt(0)!)) throw new HttpError(422, `Il font PDF non supporta il carattere ${ch}. Il testo non è stato alterato: contatta l’amministratore.`)
  return text
 }
 const line = (value: string, size = 10) => {
  if (y < 55) { page = doc.addPage([595.28, 841.89]); y = 790 }
  page.drawText(value, { x: 48, y, size, font, color: rgb(.08, .11, .2) }); y -= size + 6
 }
 const paragraph = (value: string, size = 10) => {
  for (const row of clean(value).split('\n')) {
   let pending = ''
   for (const word of row.split(/(\s+)/)) {
    if (font.widthOfTextAtSize(pending + word, size) > 495 && pending) { line(pending, size); pending = '' }
    if (font.widthOfTextAtSize(word, size) > 495) {
     for (const char of word) {
      if (font.widthOfTextAtSize(pending + char, size) > 495) { line(pending, size); pending = '' }
      pending += char
     }
    } else pending += word
   }
   line(pending, size)
  }
 }
 paragraph('UPNOLOGY', 22)
 paragraph(kind === 'contract' ? 'CONTRATTO' : `PREVENTIVO - ${offer.status}`, 15)
 paragraph(`ID ${offer.id} | Versione ${offer.version}`)
 if (offer.previous_id) paragraph(`Versione precedente: ${offer.previous_id}`)
 paragraph(`Emesso: ${offer.created_at} | Scadenza: ${offer.expires_at}`)
 paragraph(`Progetto: ${s.title}`, 13)
 paragraph(`Cliente: ${s.customer.name}\n${s.customer.address}\nCF / P. IVA: ${s.customer.tax_id}\nEmail: ${s.customer.email}`)
 paragraph(`Fornitore: ${s.supplier.name}\n${s.supplier.address}\nCF / P. IVA: ${s.supplier.tax_id}`)
 paragraph(`Descrizione\n${s.description}`)
 paragraph('Servizi concordati', 12)
 s.items.forEach((item, index) => paragraph(`${index + 1}. ${item.description}: ${euro(item.amount_cents)}`))
 paragraph(`Imponibile: ${euro(s.subtotal_cents)}\n${s.tax_label} (${s.tax_bps / 100}%): ${euro(s.tax_cents)}\nTOTALE: ${euro(s.total_cents)}`, 12)
 paragraph(`Tempistiche: ${s.timeline}\nRevisioni comprese: ${s.revisions}\nCondizioni di pagamento: ${s.payment_terms}`)
 s.instalments.forEach((amount, index) => paragraph(`Fase ${index + 1} - ${['Avvio', 'Demo approvata', 'Finale approvato'][index]}: ${s.percentages[index]}% - ${euro(amount)} - entro ${s.payment_due_days[index]} giorni dalla richiesta`))
 paragraph(`Responsabilità delle parti\n${s.responsibilities}\nCondizioni di consegna\n${s.delivery_terms}\nEsclusioni\n${s.exclusions}`)
 if (contract) {
  paragraph('Condizioni contrattuali approvate', 12); paragraph(contract.body)
  paragraph(`Impronta SHA-256 dei termini: ${contract.snapshot_hash}`)
  paragraph(contract.accepted_at ? `Accettato il ${contract.accepted_at}\nAccount: ${contract.accepted_by}\n${contract.acceptance_text}` : 'In attesa di accettazione del cliente.')
 } else if (offer.accepted_at) paragraph(`Preventivo accettato il ${offer.accepted_at}`)
 doc.getPages().forEach((p, i) => p.drawText(`${i + 1} / ${doc.getPageCount()} - Upnology`, { x: 48, y: 28, size: 8, font }))
 return doc.save({ useObjectStreams: false })
}

export const pipelineStages = ['request', 'quote', 'signature', 'payment', 'production', 'delivered', 'closed'] as const
export type PipelineStage = typeof pipelineStages[number]
export const stageLabels: Record<PipelineStage, string> = { request: 'Da qualificare', quote: 'Preventivo', signature: 'Contratto', payment: 'Pagamento dovuto', production: 'Produzione', delivered: 'Consegnato', closed: 'Archiviato' }
export type PipelineItem = { id: string; request_id: string | null; customer_user_id: string | null; offer_id: string | null; project_id: string | null; title: string; customer: string; stage: PipelineStage; amount_cents: number | null; action: string; attention: string[] }

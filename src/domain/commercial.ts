export type BillingParty = { name: string; address: string; tax_id: string; email?: string }
export type OfferSnapshot = {
 title: string; description: string; customer: BillingParty; supplier: BillingParty;
 items: { description: string; amount_cents: number }[]; subtotal_cents: number; tax_bps: number;
 tax_cents: number; tax_label: string; total_cents: number; currency: 'EUR'; timeline: string;
 payment_terms: string; revisions: number; responsibilities: string; delivery_terms: string;
 exclusions: string; percentages: number[]; payment_due_days: number[]; instalments: number[];
}
export type Contract = { id: string; snapshot: OfferSnapshot; body: string; snapshot_hash: string; accepted_at: string | null; accepted_by: string | null; acceptance_text: string | null; created_at: string }
export type Milestone = { id: string; phase: number; amount_cents: number; status: string; due_at: string | null; paid_at: string | null; refunded_cents: number }
export type Feedback = { id: string; body: string; resolution: string | null; created_at: string; resolved_at: string | null }
export type Release = { id: string; phase: number; notes: string; protection_note: string; created_at: string; approved_at: string | null; feedback: Feedback[] }
export type Offer = {
 id: string; customer_user_id: string; request_id: string | null; previous_id: string | null;
 version: number; status: string; snapshot: OfferSnapshot; template_id: string; total_cents: number;
 expires_at: string; created_at: string; accepted_at: string | null; project_id: string | null;
 contract: Contract | null; project: { id: string; status: string; commercial_stage: string; delivered_at: string | null } | null;
 milestones: Milestone[]; releases: Release[];
 payments: { stripe_livemode?: boolean | null; invoice_id?: string | null; id: string; milestone_id: string; session_id: string | null; payment_intent: string | null; status: string; amount_cents: number; created_at: string }[];
 events: { id: number; kind: string; detail: Record<string, unknown>; created_at: string }[];
 emails: { id: string; kind: string; status: string; attempts: number; recipient: string; last_error: string | null; sent_at: string | null }[];
}
export type ContractTemplate = { id: string; title: string; body: string; approved_at: string | null; legal_reference: string | null }
export type CommercialOverview = { offers: Offer[]; templates: ContractTemplate[] }
export const euro = (cents: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)

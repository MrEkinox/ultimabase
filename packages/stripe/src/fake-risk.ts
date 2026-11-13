// The fake account's payments at risk (D-388): an early fraud warning or a
// dispute a test opens on a payment, and what the plugin asks of them.
import type {
	RecoveryGateway,
	StripeInvoice,
	StripePayment,
	StripeSubscription,
} from './billing-gateway.ts'
import { Missing } from './billing-gateway.ts'

/** An early fraud warning or a dispute of the fake account. */
export interface FakeRisk {
	readonly id: string
	readonly kind: 'radar.early_fraud_warning' | 'dispute'
	/** The payment or the invoice it is about. */
	readonly charge: string
	readonly customerId: string
}

/** What a test does to put a payment at risk. */
export interface FakeRisks {
	/** The early fraud warnings and disputes, by id. */
	readonly risks: Map<string, FakeRisk>
	/** Stripe's Radar warns of a fraud on a payment or an invoice; gives its id. */
	readonly warnFraud: (payment: string) => string
	/** The payer disputes a payment or an invoice; gives its id. */
	readonly openDispute: (payment: string) => string
}

/** The statuses Stripe no longer changes. */
const ended = new Set(['canceled', 'incomplete_expired'])

/** The fake's payments at risk, over its payments and subscriptions. */
export function fakeRisks(held: {
	readonly payments: ReadonlyMap<string, StripePayment>
	readonly invoices: ReadonlyMap<string, StripeInvoice>
	readonly subscriptions: Map<string, StripeSubscription>
	readonly newId: (prefix: string) => string
	readonly send: (type: string, id: string, object: string) => void
	readonly refund: (id: string, amount: number) => void
}): {
	readonly gateway: Pick<
		RecoveryGateway,
		'riskOf' | 'refundCharge' | 'cancelSubscriptions'
	>
	readonly fake: FakeRisks
} {
	const { payments, invoices, subscriptions, newId, send } = held
	const risks = new Map<string, FakeRisk>()
	const paid = (id: string): StripePayment | StripeInvoice => {
		const one = payments.get(id) ?? invoices.get(id)
		if (one === undefined) throw new Missing(id)
		return one
	}
	/** Whether Stripe would still let the payment be refunded. */
	const refundable = (charge: string): boolean => {
		const { amount, refunded } = paid(charge)
		const disputed = [...risks.values()].some(
			(one) => one.kind === 'dispute' && one.charge === charge,
		)
		return refunded < amount && !disputed
	}
	const open = (
		kind: FakeRisk['kind'],
		charge: string,
		event: string,
	): string => {
		const id = newId(kind === 'dispute' ? 'du' : 'issfr')
		risks.set(id, { id, kind, charge, customerId: paid(charge).customerId })
		send(event, id, kind)
		return id
	}
	const fake: FakeRisks = {
		risks,
		warnFraud: (payment) =>
			open(
				'radar.early_fraud_warning',
				payment,
				'radar.early_fraud_warning.created',
			),
		openDispute: (payment) =>
			open('dispute', payment, 'charge.dispute.created'),
	}
	const gateway = {
		riskOf: async (type: string, id: string) => {
			if (type !== 'radar.early_fraud_warning' && type !== 'dispute') {
				return null
			}
			const risk = risks.get(id)
			if (risk?.kind !== type) throw new Missing(id)
			const warning = risk.kind === 'radar.early_fraud_warning'
			return {
				charge: risk.charge,
				refundable: warning && refundable(risk.charge),
			}
		},
		refundCharge: async (id: string) => {
			const { amount, refunded } = paid(id)
			if (refundable(id)) held.refund(id, amount - refunded)
		},
		cancelSubscriptions: async (customerId: string) => {
			const live = [...subscriptions.values()].filter(
				(one) => one.customerId === customerId && !ended.has(one.status),
			)
			for (const one of live) {
				const canceled = { status: 'canceled', canceledAt: new Date() }
				subscriptions.set(one.id, { ...one, ...canceled })
				send('customer.subscription.deleted', one.id, 'subscription')
			}
			return live.map(({ id }) => id)
		},
	}
	return { gateway, fake }
}

// A payment at risk (D-388): with the `risk` option, an early fraud warning
// refunds its charge, and it or a dispute ends the payer's subscriptions at
// once. The event's sync then writes the rows.
import type { Logger } from 'ultimabase'
import { Refused } from 'ultimabase'
import { ownKeys } from './keys.ts'
import { runningOf, stripeOf } from './running.ts'

/** What a payment at risk does to its payer's subscriptions (D-388). */
export interface RiskOptions {
	/** `'refundAndCancel'`: refunds the payment, ends the subscriptions. */
	readonly earlyFraudWarning?: 'refundAndCancel'
	/** `'cancel'`: ends the subscriptions; Stripe holds the payment. */
	readonly dispute?: 'cancel'
}

/** The events `risk` acts on, by the option's key. */
const risks = new Map<string, keyof RiskOptions>([
	['radar.early_fraud_warning.created', 'earlyFraudWarning'],
	['charge.dispute.created', 'dispute'],
])

/** The `risk` option, refused when it holds another key or value. */
export function riskOptionsOf(entry: string, risk: unknown): RiskOptions {
	if (risk === undefined) return {}
	ownKeys(`${entry}'s risk`, risk, [...risks.values()])
	const warning: unknown = Reflect.get(risk, 'earlyFraudWarning')
	const dispute: unknown = Reflect.get(risk, 'dispute')
	if (warning !== undefined && warning !== 'refundAndCancel') {
		throw new Refused(`${entry}: risk.earlyFraudWarning is 'refundAndCancel'.`)
	}
	if (dispute !== undefined && dispute !== 'cancel') {
		throw new Refused(`${entry}: risk.dispute is 'cancel'.`)
	}
	return {
		...(warning === undefined ? {} : { earlyFraudWarning: warning }),
		...(dispute === undefined ? {} : { dispute }),
	}
}

/**
 * Acts on an event about a payment at risk, if `risk` asks: refunds the
 * charge an actionable warning is about, then ends the customer's
 * subscriptions. Outside the customer's lock: each call changes nothing
 * when the job runs again.
 */
export async function settleRisk(
	event: {
		readonly type: string
		readonly objectType: string
		readonly objectId: string
	},
	customer: string,
	logger: Logger,
): Promise<void> {
	const key = risks.get(event.type)
	const action =
		key === undefined ? undefined : runningOf('stripe.event').risk[key]
	if (action === undefined) return
	const { gateway } = stripeOf('stripe.event')
	const risk = await gateway.riskOf(event.objectType, event.objectId)
	if (risk === null) return
	const refunded = action === 'refundAndCancel' && risk.refundable
	if (refunded) await gateway.refundCharge(risk.charge)
	const canceled = await gateway.cancelSubscriptions(customer)
	const { charge } = risk
	logger.warn(
		{ event: event.type, charge, customer, refunded, canceled },
		'A payment is at risk: its payer’s subscriptions were canceled.',
	)
}

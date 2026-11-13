// A payer's second subscription, with `oneSubscription` (D-373 point 6): a
// sync finds it, and a job ends it at once and refunds it. Its events then
// sync the payer again.
import type { Job } from '@ultimabase/jobs'
import { defineJob } from '@ultimabase/jobs'
import type { StripeSubscription } from './billing-gateway.ts'
import { liveStatuses } from './billing-gateway.ts'
import { strings } from './job-input.ts'
import { stripeOf } from './running.ts'

/**
 * The live subscriptions beyond the first: the oldest stays. One still
 * `incomplete` is not paid, and Stripe expires it within a day.
 */
export const duplicatesOf = (
	subscriptions: readonly StripeSubscription[],
): readonly StripeSubscription[] =>
	subscriptions
		.filter(({ status }) => liveStatuses.includes(status))
		.toSorted(
			(one, other) =>
				one.startedAt.getTime() - other.startedAt.getTime() ||
				one.id.localeCompare(other.id),
		)
		.slice(1)

/** Ends a second subscription at once and refunds it: the payer paid twice. */
export const duplicateJob: Job<
	'stripe.duplicate',
	{ readonly subscription: string }
> = defineJob({
	name: 'stripe.duplicate',
	input: strings('subscription'),
	// Each sync until it ends finds it again: one run at a time.
	key: ({ subscription }) => subscription,
	run: async ({ input, logger }) => {
		await stripeOf('stripe.duplicate').gateway.cancelAndRefund(
			input.subscription,
		)
		logger.error(
			input,
			'A payer’s second subscription was canceled and refunded.',
		)
	},
})

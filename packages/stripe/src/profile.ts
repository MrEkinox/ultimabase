// A payer's profile reaches Stripe when it changes (D-385): the payer
// model's hook compares what `customer` gives of the row before and after,
// and a job pushes the new profile, outside the payer's write.
import type { Job } from '@ultimabase/jobs'
import { defineJob } from '@ultimabase/jobs'
import { Missing } from './billing-gateway.ts'
import { locked, profileOf } from './customer.ts'
import { strings } from './job-input.ts'
import { M, StripeCustomer } from './models.ts'
import { payersOf, runningOf, stripeOf } from './running.ts'

/**
 * Pushes the payer's profile to its customer, under the customer's lock,
 * when it differs from the last one pushed. A payer gone, or not a customer,
 * ends the job; so does a customer Stripe deleted, which its sync forgets.
 */
export const profileJob: Job<
	'stripe.profile',
	{ readonly model: string; readonly payer: string }
> = defineJob({
	name: 'stripe.profile',
	input: strings('model', 'payer'),
	key: ({ model, payer }) => `${model}:${payer}`,
	run: async ({ input }) => {
		const payers = payersOf(runningOf('stripe.profile')).get(input.model)
		const { gateway } = stripeOf('stripe.profile')
		const held = await StripeCustomer.findUnique({ where: input }, M)
		if (payers === undefined || held === null) return
		await locked(held.id, async (row) => {
			const where = { id: input.payer }
			const payer = await payers.findUnique({ where }, M)
			if (payer === null || row.stripeId === null) return
			const profile = profileOf(payer)
			const json = JSON.stringify(profile)
			if (row.profile === json) return
			try {
				await gateway.updateCustomer(row.stripeId, profile)
			} catch (error) {
				if (error instanceof Missing) return
				throw error
			}
			const data = { profile: json }
			await StripeCustomer.update({ where: { id: row.id }, data }, M)
		})
	},
})

/**
 * A payer model's after-update hook: enqueues the push when the profile
 * changed, in the update's transaction. An unchanged profile reads nothing.
 */
export async function profileChanged(facts: {
	readonly name: string
	readonly record: object
	readonly previous: object
}): Promise<void> {
	const { name, record, previous } = facts
	const running = runningOf('stripe')
	const payer: unknown = Reflect.get(record, 'id')
	if (running.stripe === undefined || !payersOf(running).has(name)) return
	if (typeof payer !== 'string') return
	const before = JSON.stringify(profileOf(previous))
	if (before === JSON.stringify(profileOf(record))) return
	await profileJob.enqueue({ model: name, payer })
}

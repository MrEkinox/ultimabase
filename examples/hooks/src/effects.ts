import { setTimeout } from 'node:timers/promises'

/** One message the blog sends outside the database: an e-mail or a webhook. */
export interface Message {
	readonly to: string
	readonly subject: string
	readonly body?: unknown
}

/** Every message delivered so far, in order; the tests read it. */
export const outbox: Message[] = []

/**
 * Stand-in for an e-mail or webhook client. Like a real one, it answers after
 * a network round trip; replace it with your provider's client.
 */
export const sendMessage = async (message: Message): Promise<void> => {
	await setTimeout(20)
	outbox.push(message)
}

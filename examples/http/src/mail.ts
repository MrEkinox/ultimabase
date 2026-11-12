// Stands for the shop's email service.

/** The emails sent, in order. */
export const outbox: string[] = []

/** Sends an email. */
export function sendEmail(text: string) {
	outbox.push(text)
}

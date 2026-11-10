// Stands for an email service, which can be down.

export const mailer = {
	down: false,
	/** The emails sent, in order. */
	sent: [] as string[],
	send(text: string): void {
		if (mailer.down) throw new Error('The mail service is down.')
		mailer.sent.push(text)
	},
}

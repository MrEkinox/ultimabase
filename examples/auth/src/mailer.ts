/** One message the application sends. */
export interface Email {
	readonly to: string
	readonly subject: string
	/** The link the reader follows; account tokens travel in its fragment. */
	readonly link?: string
}

/**
 * Stands in for an email provider: UltimaBase sends no email, the
 * application's callbacks do. Replace `sendEmail` with your provider's
 * client; the tests read `outbox` to follow the links a member would open.
 */
export const outbox: Email[] = []

export const sendEmail = (email: Email): void => {
	outbox.push(email)
}

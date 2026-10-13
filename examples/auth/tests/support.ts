import { outbox } from '../src/mailer.ts'

// Fixed fake credentials of the tests: valid passwords have 15 to 256
// code points.
export const adaPassword = 'correct horse battery staple'
export const newPassword = 'another correct horse battery staple'

/** The token of the latest email with this subject sent to `to`. */
export const tokenSentTo = (to: string, subject: string): string => {
	const link = outbox.findLast(
		(email) => email.to === to && email.subject === subject,
	)?.link
	if (link === undefined) throw new TypeError(`No "${subject}" sent to ${to}`)
	return new URL(link).hash.slice(1)
}

/** The subjects of the emails sent to `to`, in order. */
export const subjectsSentTo = (to: string): readonly string[] =>
	outbox.filter((email) => email.to === to).map(({ subject }) => subject)

const field = (value: unknown, key: string): unknown =>
	typeof value === 'object' && value !== null
		? Reflect.get(value, key)
		: undefined

/** The session token of an `/api/auth` answer, checked like untrusted input. */
export const sessionTokenOf = async (response: Response): Promise<string> => {
	const body: unknown = await response.json()
	const token = field(field(field(body, 'result'), 'session'), 'token')
	if (typeof token !== 'string') throw new TypeError('No session token')
	return token
}

// The emails password sends: a link to reset the password, verify the email
// or confirm a new one, and the notices of a changed email or password. This
// example keeps them in a list its tests read; an application sends them with
// its email provider.
import type { Email } from '@ultimabase/password'

export const outbox: (Email & { readonly text: string })[] = []

//#region send-email
const pages = {
	reset: 'reset-password',
	verify: 'verify-email',
	emailChange: 'confirm-email',
}

export async function sendEmail(email: Email): Promise<void> {
	if (email.kind === 'emailChanged') {
		// To the old address, which may not have asked for the change.
		const text = `Your email is now ${email.newEmail}. Not you? Contact us.`
		outbox.push({ ...email, text })
		return
	}
	if (email.kind === 'passwordChanged') {
		const text = 'Your password was changed. Not you? Reset it.'
		outbox.push({ ...email, text })
		return
	}
	// The link opens the application's page, which sends the token to
	// resetPassword, verifyEmail or confirmEmailChange.
	const link = `https://example.com/${pages[email.kind]}?token=${email.token}`
	// An application sends the text to `email.to` with its email provider.
	outbox.push({ ...email, text: `Open ${link}` })
}
//#endregion

//#region emailed
/** The token of the latest email of `kind`, once `sendEmail` has it. */
export async function emailed(
	kind: 'reset' | 'verify' | 'emailChange',
): Promise<string> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const found = outbox.findLast((email) => email.kind === kind)
		if (found !== undefined && 'token' in found) return found.token
		// The emails go out after the function answers.
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
	throw new Error(`No ${kind} email was sent.`)
}
//#endregion

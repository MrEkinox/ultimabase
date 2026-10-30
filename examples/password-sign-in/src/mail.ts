// The emails password sends: a reset link, or a verification link. This
// example keeps them in a list its tests read; an application sends them
// with its email provider.
import type { Email } from '@ultimabase/password'

export const outbox: (Email & { readonly link: string })[] = []

//#region send-email
export async function sendEmail(email: Email): Promise<void> {
	// The link opens the application's page, which sends the token to
	// resetPassword or verifyEmail.
	const page = email.kind === 'reset' ? 'reset-password' : 'verify-email'
	const link = `https://example.com/${page}?token=${email.token}`
	// An application sends `link` to `email.to` with its email provider.
	outbox.push({ ...email, link })
}
//#endregion

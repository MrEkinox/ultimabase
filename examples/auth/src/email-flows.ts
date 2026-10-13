import type {
	PasswordEmailChangeOptions,
	PasswordResetOptions,
	PasswordVerificationOptions,
} from '@ultimabase/auth-password'

import { sendEmail } from './mailer.ts'

// Each option group enables one email flow of `password()`. The callbacks run
// after the request commits, outside it: their duration and failures never
// reach the client.

//#region reset
/** The token travels in the URL fragment, which browsers never send to a server. */
export const reset = {
	sendResetEmail: ({ email, token }) => {
		sendEmail({
			to: email,
			subject: 'Reset your password',
			link: `https://notes.example.com/reset#${token}`,
		})
	},
} satisfies PasswordResetOptions
//#endregion reset

//#region verification
/** Sent after sign-up and on request, while the email is unverified. */
export const verification = {
	sendVerificationEmail: ({ email, token }) => {
		sendEmail({
			to: email,
			subject: 'Verify your email',
			link: `https://notes.example.com/verify#${token}`,
		})
	},
} satisfies PasswordVerificationOptions
//#endregion verification

//#region email-change
/** The new address proves its mailbox; the previous one is told afterwards. */
export const emailChange = {
	sendConfirmationEmail: ({ email, token }) => {
		sendEmail({
			to: email,
			subject: 'Confirm your new email',
			link: `https://notes.example.com/confirm-email#${token}`,
		})
	},
	sendNoticeEmail: ({ email, newEmail }) => {
		sendEmail({ to: email, subject: `Your email changed to ${newEmail}` })
	},
} satisfies PasswordEmailChangeOptions
//#endregion email-change

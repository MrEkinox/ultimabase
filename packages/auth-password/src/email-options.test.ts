import { describe, expect, it } from 'vitest'

import { resolvePasswordEmailOptions } from './email-options.js'

const send = (): undefined => undefined

describe('password email options', () => {
	it('enables nothing by default and applies bounded defaults per group', () => {
		expect(resolvePasswordEmailOptions({ identifier: 'email' })).toStrictEqual({
			emailChange: undefined,
			reset: undefined,
			verification: undefined,
		})
		const resolved = resolvePasswordEmailOptions({
			emailChange: { sendConfirmationEmail: send, sendNoticeEmail: send },
			identifier: 'email',
			reset: { sendResetEmail: send },
			verification: { sendVerificationEmail: send },
		})
		expect(resolved.reset?.expiresInMs).toBe(60 * 60_000)
		expect(resolved.emailChange?.expiresInMs).toBe(60 * 60_000)
		expect(resolved.verification).toMatchObject({
			expiresInMs: 24 * 60 * 60_000,
			requireVerifiedEmail: false,
		})
	})

	it('rejects unbounded lifetimes, missing callbacks and unknown keys', () => {
		for (const expiresInMs of [60_000, 25 * 60 * 60_000, 1.5]) {
			expect(() =>
				resolvePasswordEmailOptions({
					identifier: 'email',
					reset: { expiresInMs, sendResetEmail: send },
				}),
			).toThrow('password reset.expiresInMs must be a safe integer')
		}
		expect(() =>
			resolvePasswordEmailOptions({
				identifier: 'email',
				verification: {
					expiresInMs: 8 * 24 * 60 * 60_000,
					sendVerificationEmail: send,
				},
			}),
		).toThrow('password verification.expiresInMs')
		expect(() =>
			resolvePasswordEmailOptions({ identifier: 'email', reset: {} }),
		).toThrow('password reset.sendResetEmail must be a function')
		expect(() =>
			resolvePasswordEmailOptions({
				emailChange: { sendConfirmationEmail: send },
				identifier: 'email',
			}),
		).toThrow('password emailChange.sendNoticeEmail must be a function')
		expect(() =>
			resolvePasswordEmailOptions({
				identifier: 'email',
				reset: { sendResetEmail: send, sendResetSms: send },
			}),
		).toThrow('password reset contains unknown option: sendResetSms')
		expect(() =>
			resolvePasswordEmailOptions({
				identifier: 'email',
				verification: {
					requireVerifiedEmail: 'yes',
					sendVerificationEmail: send,
				},
			}),
		).toThrow('requireVerifiedEmail must be a boolean')
	})

	it('requires the email identifier', () => {
		expect(() =>
			resolvePasswordEmailOptions({
				identifier: 'username',
				reset: { sendResetEmail: send },
			}),
		).toThrow("require identifier: 'email'")
	})
})

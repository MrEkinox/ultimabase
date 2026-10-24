// Password hashes (D-113): Argon2id from `node:crypto`, stored as a PHC string.
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto'

type Parameters = {
	readonly memory: number
	readonly passes: number
	readonly parallelism: number
}

/** OWASP's first Argon2id setting: 19 MiB, two passes, one lane. */
const current: Parameters = { memory: 19456, passes: 2, parallelism: 1 }
const tagLength = 32
const phc =
	/^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/

const unpadded = (bytes: Buffer): string =>
	bytes.toString('base64').replace(/=+$/, '')

async function derive(
	password: string,
	nonce: Buffer,
	parameters: Parameters,
	length: number,
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		argon2(
			'argon2id',
			{ message: password, nonce, tagLength: length, ...parameters },
			(error, key) => {
				if (error === null) resolve(key)
				else reject(error)
			},
		)
	})
}

/** The PHC string of `password`, with a new 16-byte salt. */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16)
	const key = await derive(password, salt, current, tagLength)
	const { memory, passes, parallelism } = current
	return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${unpadded(salt)}$${unpadded(key)}`
}

/**
 * Whether a stored hash is one this plugin could verify: up to 256 MiB, 16
 * passes and 16 lanes, and a tag of 16 to 64 bytes, so a tampered row
 * neither exhausts the server nor matches too easily.
 */
const bounded = (
	{ memory, passes, parallelism }: Parameters,
	length: number,
): boolean =>
	parallelism >= 1 &&
	parallelism <= 16 &&
	memory >= 8 * parallelism &&
	memory <= 262_144 &&
	passes >= 1 &&
	passes <= 16 &&
	length >= 16 &&
	length <= 64

/**
 * Whether `password` matches `stored`, and whether `stored` was made with
 * other parameters, so a sign-in rehashes it.
 */
export async function verifyPassword(
	password: string,
	stored: string,
): Promise<{ readonly valid: boolean; readonly stale: boolean }> {
	const parts = phc.exec(stored)
	if (parts === null) throw new Error('A stored password hash is not Argon2id.')
	const [, m, t, p, salt = '', hash = ''] = parts
	const parameters = {
		memory: Number(m),
		passes: Number(t),
		parallelism: Number(p),
	}
	const expected = Buffer.from(hash, 'base64')
	if (!bounded(parameters, expected.length)) {
		throw new Error('A stored password hash has out-of-bounds parameters.')
	}
	const key = await derive(
		password,
		Buffer.from(salt, 'base64'),
		parameters,
		expected.length,
	)
	const stale =
		parameters.memory !== current.memory ||
		parameters.passes !== current.passes ||
		parameters.parallelism !== current.parallelism ||
		expected.length !== tagLength
	return { valid: timingSafeEqual(key, expected), stale }
}

let dummy: Promise<string> | undefined
/** A hash no password matches, checked for an unknown email (D-113). */
export async function dummyHash(): Promise<string> {
	dummy ??= hashPassword(randomBytes(32).toString('base64'))
	return dummy
}

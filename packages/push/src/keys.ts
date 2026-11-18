// `npx @ultimabase/push keys` (D-408 point 10): a new pair of VAPID keys,
// printed as the environment variables the documentation reads.
import { generateKeyPairSync } from 'node:crypto'

const bytes = (value: string | undefined) =>
	Buffer.from(value ?? '', 'base64url')

/** A new P-256 pair: the public point and the private scalar, base64url. */
export function newKeys(): { publicKey: string; privateKey: string } {
	const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
	const { x, y, d } = privateKey.export({ format: 'jwk' })
	return {
		publicKey: Buffer.concat([Buffer.from([4]), bytes(x), bytes(y)]).toString(
			'base64url',
		),
		privateKey: bytes(d).toString('base64url'),
	}
}

const usage = 'Usage: npx @ultimabase/push keys\n'

/** Runs the command `args` name; its exit code. */
export function main(
	args: readonly string[],
	write: (text: string) => void,
): number {
	if (args.length !== 1 || args[0] !== 'keys') {
		write(usage)
		return 1
	}
	const { publicKey, privateKey } = newKeys()
	write(
		`PUSH_WEB_PUBLIC_KEY=${publicKey}\nPUSH_WEB_PRIVATE_KEY=${privateKey}\n`,
	)
	return 0
}

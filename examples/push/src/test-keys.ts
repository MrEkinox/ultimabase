// The tests' web keys, new at each run and set before app.ts reads them. An
// application's come from `npx @ultimabase/push keys`, in its environment.
import { generateKeyPairSync } from 'node:crypto'

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const { x = '', y = '', d = '' } = privateKey.export({ format: 'jwk' })
const point = [
	Buffer.of(4),
	Buffer.from(x, 'base64url'),
	Buffer.from(y, 'base64url'),
]
export const publicKey = Buffer.concat(point).toString('base64url')
process.env['PUSH_WEB_PUBLIC_KEY'] = publicKey
process.env['PUSH_WEB_PRIVATE_KEY'] = d

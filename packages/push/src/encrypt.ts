// Web Push's message encryption (RFC 8291) in one `aes128gcm` record
// (RFC 8188), on `node:crypto` (D-408 point 1).
import type { ECDH } from 'node:crypto'
import {
	createCipheriv,
	createDecipheriv,
	createECDH,
	hkdfSync,
	randomBytes,
} from 'node:crypto'

const recordSize = 4096
/** The header: salt (16), record size (4), key length (1), the key (65). */
const headerSize = 86
const tagSize = 16
/** The longest message one record carries, its delimiter left out. */
export const maxMessage: number = recordSize - headerSize - tagSize - 1

/** A browser's subscription keys, decoded. */
export interface Receiver {
	/** Its P-256 public key, uncompressed (65 bytes). */
	readonly p256dh: Buffer
	/** Its authentication secret (16 bytes). */
	readonly auth: Buffer
}

/** What the sender draws for each message; a test gives the RFC's. */
export interface Drawn {
	readonly salt: Buffer
	/** The sender's one-time key pair. */
	readonly ecdh: ECDH
}

const drawn = (): Drawn => {
	const ecdh = createECDH('prime256v1')
	ecdh.generateKeys()
	return { salt: randomBytes(16), ecdh }
}

const hkdf = (ikm: Buffer, salt: Buffer, info: Buffer, length: number) =>
	Buffer.from(hkdfSync('sha256', ikm, salt, info, length))

const label = (name: string) => Buffer.from(`Content-Encoding: ${name}\0`)

/** The content key and nonce of a message (RFC 8291 section 3.4). */
function keysOf(
	secret: Buffer,
	auth: Buffer,
	receiver: Buffer,
	sender: Buffer,
	salt: Buffer,
): { readonly key: Buffer; readonly nonce: Buffer } {
	const info = Buffer.concat([Buffer.from('WebPush: info\0'), receiver, sender])
	const ikm = hkdf(secret, auth, info, 32)
	return {
		key: hkdf(ikm, salt, label('aes128gcm'), 16),
		nonce: hkdf(ikm, salt, label('nonce'), 12),
	}
}

/** `message` encrypted for `receiver`: the body of a push request. */
export function encrypt(
	message: Buffer,
	receiver: Receiver,
	{ salt, ecdh }: Drawn = drawn(),
): Buffer {
	const sender = ecdh.getPublicKey()
	const secret = ecdh.computeSecret(receiver.p256dh)
	const { key, nonce } = keysOf(
		secret,
		receiver.auth,
		receiver.p256dh,
		sender,
		salt,
	)
	const cipher = createCipheriv('aes-128-gcm', key, nonce)
	// The last record's delimiter, and no padding.
	const plain = Buffer.concat([message, Buffer.from([2])])
	const sealed = [cipher.update(plain), cipher.final(), cipher.getAuthTag()]
	const header = Buffer.alloc(21)
	salt.copy(header)
	header.writeUInt32BE(recordSize, 16)
	header.writeUInt8(sender.length, 20)
	return Buffer.concat([header, sender, ...sealed])
}

/** The message of a push body, as the browser of `ecdh` and `auth` reads it. */
export function decrypt(body: Buffer, ecdh: ECDH, auth: Buffer): Buffer {
	const salt = body.subarray(0, 16)
	const end = 21 + body.readUInt8(20)
	const sender = body.subarray(21, end)
	const sealed = body.subarray(end)
	const secret = ecdh.computeSecret(sender)
	const receiver = ecdh.getPublicKey()
	const { key, nonce } = keysOf(secret, auth, receiver, sender, salt)
	const decipher = createDecipheriv('aes-128-gcm', key, nonce)
	decipher.setAuthTag(sealed.subarray(-tagSize))
	const plain = Buffer.concat([
		decipher.update(sealed.subarray(0, -tagSize)),
		decipher.final(),
	])
	// Padding is zeros after the delimiter.
	return plain.subarray(0, plain.lastIndexOf(2))
}

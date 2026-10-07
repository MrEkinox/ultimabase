import { v7 as uuidV7 } from 'uuid'

/** Generates one UUID v7 from the operation's Unix timestamp in milliseconds. */
export type UuidV7Generator = (timestamp: number) => string

/** Delegates RFC 9562 layout and cryptographic randomness to the maintained uuid package. */
export const generateUuidV7: UuidV7Generator = (timestamp) =>
	uuidV7({ msecs: timestamp })

// `push` (D-408): what an application's functions and jobs call.
import type { Caller } from 'ultimabase'
import type { PushDeviceInput } from './register.ts'
import { register, unregister } from './register.ts'
import { runningOf } from './running.ts'
import type { PushMessage, SendOptions, Sent } from './send.ts'
import { send } from './send.ts'

/** Registers devices and sends them messages, while the application runs. */
export interface PushApi {
	/** Saves the device of the caller's session; `false` without web keys. */
	register(caller: Caller, device: PushDeviceInput): Promise<boolean>
	/** Deletes the device of the caller's session. */
	unregister(caller: Caller): Promise<void>
	/** Sends `message` to each device of `userIds`. */
	send(
		userIds: readonly string[],
		message: PushMessage,
		options?: SendOptions,
	): Promise<Sent>
	/** The web public key a browser subscribes with, or `undefined`. */
	readonly publicKey: string | undefined
}

export const push: PushApi = {
	register,
	unregister,
	send,
	get publicKey() {
		return runningOf('push.publicKey').vapid?.publicKey
	},
}

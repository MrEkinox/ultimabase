import { FrameworkError } from '../errors/framework-error.js'

/** Throws the canonical capability-planning conflict with private diagnostics. */
export const throwCapabilityConflict = (
	message: string,
	internalDetails: Readonly<Record<string, unknown>>,
): never => {
	throw new FrameworkError('PLUGIN_CAPABILITY_CONFLICT', message, {
		internalDetails,
	})
}

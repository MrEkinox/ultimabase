import {
	contributeOperation,
	defineOperation,
	defineOperationValue,
	type PluginOperationDefinition,
	type RequestContext,
} from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import {
	authErrorCodes,
	defineAuthMethod,
	type AuthMethod,
	type AuthMethodStaticsHKT,
	type AuthServices,
} from '../../src/index.js'

/**
 * One test scenario, run inside a probe operation with the foundation's
 * services, as a real method's handler would.
 */
export type ProbeScenario = (
	services: AuthServices,
	context: RequestContext,
	input: unknown,
) => Promise<unknown>

/** Names the scenario a probe operation runs and its input. */
export interface ProbeInput {
	readonly input?: unknown
	readonly scenario: string
}

/** Freezes plain test data in place, as operation boundaries require. */
const freezeDeep = (value: unknown): unknown => {
	if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
		for (const item of Object.values(value)) freezeDeep(item)
		Object.freeze(value)
	}
	return value
}

const probeInput = defineOperationValue<ProbeInput>((value, path) => {
	if (!isPlainRecord(value) || typeof value.scenario !== 'string') {
		throw new TypeError(`${path} must name a scenario`)
	}
	return immutableRecord({
		input: freezeDeep(structuredClone(value.input)),
		scenario: value.scenario,
	})
})
// Scenario results are test data: the contract keeps them as they are.
const probeResult = defineOperationValue<unknown>(freezeDeep)
const probeErrors = [...Object.values(authErrorCodes), 'PROBE_TEAPOT']

const probeOperation = <const TName extends string>(name: TName) =>
	defineOperation({
		errors: probeErrors,
		input: probeInput,
		name: `fixture.auth.probe.${name}`,
		result: probeResult,
		target: 'application',
		transaction: 'required',
		version: '1.0.0',
	})

/** Runs one scenario; served at `probe` with a JSON result. */
export const probeRun: PluginOperationDefinition<
	'fixture.auth.probe.run',
	'1.0.0',
	'application',
	ProbeInput,
	unknown,
	string[]
> = probeOperation('run')

/** Runs one scenario returning a sign-in result; served at `probe-session`. */
export const probeSession: PluginOperationDefinition<
	'fixture.auth.probe.session',
	'1.0.0',
	'application',
	ProbeInput,
	unknown,
	string[]
> = probeOperation('session')

/** Runs one scenario that never reads the session; served at `probe-recover`. */
export const probeRecover: PluginOperationDefinition<
	'fixture.auth.probe.recover',
	'1.0.0',
	'application',
	ProbeInput,
	unknown,
	string[]
> = probeOperation('recover')

/** The static member the probe adds to the User class. */
export interface ProbeStatics extends AuthMethodStaticsHKT {
	readonly statics: {
		runProbe(scenario: string, input?: unknown): Promise<unknown>
	}
}

/** Configures one probe method. */
export interface ProbeMethodOptions {
	/** Checks the data of every User create, like a canonical identifier rule. */
	readonly checkUserData?: (data: Readonly<Record<string, unknown>>) => void
	/** Receives each user whose probe account is unlinked. */
	readonly onUnlink?: (userId: string) => void
	readonly requireVerifiedEmail?: boolean
	/** The scenarios the probe operations run, by name. */
	readonly scenarios: Readonly<Record<string, ProbeScenario>>
	readonly userEmail?: boolean
}

type ProbeOperation =
	typeof probeRecover | typeof probeRun | typeof probeSession

/**
 * A test-only method that hands scenarios the foundation's services, so the
 * package's own suites exercise the method contract without a real method.
 */
export const probeMethod = (
	options: ProbeMethodOptions,
): AuthMethod<
	'probe',
	Readonly<Record<never, never>>,
	ProbeStatics,
	ProbeOperation
> => {
	const run =
		(services: AuthServices) =>
		({
			context,
			input,
		}: Readonly<{ context: RequestContext; input: ProbeInput }>) => {
			const scenario = options.scenarios[input.scenario]
			if (scenario === undefined) {
				throw new TypeError(`Unknown probe scenario: ${input.scenario}`)
			}
			return scenario(services, context, input.input)
		}
	return defineAuthMethod<
		'probe',
		Readonly<Record<never, never>>,
		ProbeStatics,
		ProbeOperation
	>({
		name: 'probe',
		...(options.userEmail === undefined
			? {}
			: { userEmail: options.userEmail }),
		...(options.requireVerifiedEmail === undefined
			? {}
			: { requireVerifiedEmail: options.requireVerifiedEmail }),
		...(options.checkUserData === undefined
			? {}
			: { checkUserData: options.checkUserData }),
		errorStatuses: { PROBE_TEAPOT: 418 },
		contributions: (services) => [
			contributeOperation({ operation: probeRun, execute: run(services) }),
			contributeOperation({ operation: probeSession, execute: run(services) }),
			contributeOperation({ operation: probeRecover, execute: run(services) }),
		],
		routes: [
			{ body: 'json', operation: probeRun, path: 'probe', response: 'result' },
			{
				body: 'json',
				operation: probeSession,
				path: 'probe-session',
				response: 'session',
			},
			{
				anonymous: true,
				body: 'json',
				operation: probeRecover,
				path: 'probe-recover',
				response: 'result',
			},
		],
		statics: (services) => ({
			runProbe: (scenario: string, input?: unknown) =>
				services.execute(probeRun, { input, scenario }),
		}),
		unlink: (userId) => {
			options.onUnlink?.(userId)
			return Promise.resolve()
		},
	})
}

/** Reads one scenario input record. */
export const readProbeRecord = (
	input: unknown,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(input)) throw new TypeError('Probe input must be a record')
	return input
}

/** Reads one string of a scenario input record. */
export const readProbeString = (
	record: Readonly<Record<string, unknown>>,
	key: string,
): string => {
	const value = record[key]
	if (typeof value !== 'string') throw new TypeError(`Probe ${key} is missing`)
	return value
}

/** Reads one nested value of test data, `undefined` when a step is missing. */
export const readProbePath = (
	value: unknown,
	...path: readonly string[]
): unknown =>
	path.reduce<unknown>(
		(current, key) => (isPlainRecord(current) ? current[key] : undefined),
		value,
	)

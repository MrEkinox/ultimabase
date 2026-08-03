import { assertNonEmptyString } from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import {
	assertServiceToken,
	type ServiceToken,
	type ServiceTokenIdentity,
} from './service-token.js'

type DisposableService = AsyncDisposable | Disposable

const requiredPluginServiceIdentity: unique symbol = Symbol(
	'UltimaBaseRequiredPluginService',
)

/**
 * Resolves one service that a plugin declared as mandatory during setup.
 *
 * The reference may be captured before its provider runs. Application setup
 * validates every requirement after all plugins have contributed services.
 */
export interface RequiredPluginService<TService> {
	readonly debugName: string
	readonly [requiredPluginServiceIdentity]: (service: TService) => TService
	/** Returns the application-local service after successful setup validation. */
	get(): TService
}

/** Restricts plugin setup to one owner-aware view of application services. */
export interface PluginServiceRegistry {
	readonly size: number
	provide<TService>(
		token: ServiceToken<TService>,
		service: NoInfer<TService>,
	): void
	has<TService>(token: ServiceToken<TService>): boolean
	get<TService>(token: ServiceToken<TService>): TService
	getOptional<TService>(token: ServiceToken<TService>): TService | undefined
	/** Declares a deferred setup requirement without depending on provider order. */
	require<TService>(
		token: ServiceToken<TService>,
	): RequiredPluginService<TService>
}

interface ServiceRequirement {
	readonly ownerPlugin: string
	readonly token: ServiceTokenIdentity
}

const isObjectLike = (value: unknown): value is object =>
	(typeof value === 'object' && value !== null) || typeof value === 'function'

const isDisposableService = (value: unknown): value is DisposableService => {
	if (!isObjectLike(value)) {
		return false
	}

	return (
		(Symbol.asyncDispose in value &&
			typeof value[Symbol.asyncDispose] === 'function') ||
		(Symbol.dispose in value && typeof value[Symbol.dispose] === 'function')
	)
}

/** Stores application-scoped service instances by nominal token identity. */
export class ServiceRegistry {
	readonly #services = new Map<ServiceTokenIdentity, unknown>()
	readonly #owners = new Map<ServiceTokenIdentity, string | undefined>()
	readonly #requirements: ServiceRequirement[] = []
	readonly #disposables = new AsyncDisposableStack()
	readonly #ownedDisposables = new WeakSet<DisposableService>()
	#disposed = false

	/** Returns the number of currently available service identities. */
	get size(): number {
		return this.#services.size
	}

	/** Registers one typed service without allowing configuration-order replacement. */
	provide<TService>(
		token: ServiceToken<TService>,
		service: NoInfer<TService>,
	): void {
		this.#provideOwnedService(undefined, token, service)
	}

	/** Creates a plugin-owned facade without exposing owner selection to plugin code. */
	forPlugin(pluginName: string): PluginServiceRegistry {
		assertNonEmptyString(pluginName, 'pluginName')
		const getSize = (): number => this.size

		return Object.freeze({
			get size(): number {
				return getSize()
			},
			provide: <TService>(
				token: ServiceToken<TService>,
				service: NoInfer<TService>,
			): void => {
				this.#provideOwnedService(pluginName, token, service)
			},
			has: <TService>(token: ServiceToken<TService>): boolean =>
				this.has(token),
			get: <TService>(token: ServiceToken<TService>): TService =>
				this.get(token),
			getOptional: <TService>(
				token: ServiceToken<TService>,
			): TService | undefined => this.getOptional(token),
			require: <TService>(
				token: ServiceToken<TService>,
			): RequiredPluginService<TService> =>
				this.#requireOwnedService(pluginName, token),
		})
	}

	/** Fails setup when one plugin-declared service requirement is unresolved. */
	validateRequirements(): void {
		for (const requirement of this.#requirements) {
			if (this.#services.has(requirement.token)) {
				continue
			}

			throw new FrameworkError(
				'SERVICE_NOT_FOUND',
				`Required service not found: ${requirement.token.debugName}`,
				{
					internalDetails: {
						requiredBy: requirement.ownerPlugin,
						service: requirement.token.debugName,
					},
				},
			)
		}
	}

	/** Returns the plugin that provided a service, or undefined for application-owned values. */
	ownerOf<TService>(token: ServiceToken<TService>): string | undefined {
		this.#assertToken(token)

		return this.#owners.get(token)
	}

	#provideOwnedService<TService>(
		ownerPlugin: string | undefined,
		token: ServiceToken<TService>,
		service: NoInfer<TService>,
	): void {
		this.#assertToken(token)

		if (this.#disposed) {
			throw new FrameworkError(
				'SERVICE_REGISTRY_DISPOSED',
				`Cannot provide service after registry disposal: ${token.debugName}`,
				{ internalDetails: { service: token.debugName } },
			)
		}

		if (this.#services.has(token)) {
			throw new FrameworkError(
				'SERVICE_ALREADY_PROVIDED',
				`Service already provided: ${token.debugName}`,
				{ internalDetails: { service: token.debugName } },
			)
		}

		this.#trackDisposable(service)
		this.#services.set(token, service)
		this.#owners.set(token, ownerPlugin)
	}

	/** Checks one token without changing registry state. */
	has<TService>(token: ServiceToken<TService>): boolean {
		this.#assertToken(token)

		return this.#services.has(token)
	}

	/** Retrieves one required service or reports a typed configuration failure. */
	get<TService>(token: ServiceToken<TService>): TService {
		this.#assertToken(token)

		if (!this.#services.has(token)) {
			throw new FrameworkError(
				'SERVICE_NOT_FOUND',
				`Service not found: ${token.debugName}`,
				{ internalDetails: { service: token.debugName } },
			)
		}

		// The token and value relationship is established only through provide().
		return this.#services.get(token) as TService
	}

	/** Retrieves one optional service without converting absence into an error. */
	getOptional<TService>(token: ServiceToken<TService>): TService | undefined {
		this.#assertToken(token)

		if (!this.#services.has(token)) {
			return undefined
		}

		// The preceding identity check also supports services whose value is undefined.
		return this.#services.get(token) as TService
	}

	/** Releases references before disposing owned resources in reverse order. */
	async dispose(): Promise<void> {
		if (this.#disposed) {
			return
		}

		this.#disposed = true
		this.#services.clear()
		this.#owners.clear()
		this.#requirements.length = 0

		await this.#disposables.disposeAsync()
	}

	#requireOwnedService<TService>(
		ownerPlugin: string,
		token: ServiceToken<TService>,
	): RequiredPluginService<TService> {
		this.#assertToken(token)

		if (this.#disposed) {
			throw new FrameworkError(
				'SERVICE_REGISTRY_DISPOSED',
				`Cannot require service after registry disposal: ${token.debugName}`,
				{ internalDetails: { service: token.debugName } },
			)
		}

		this.#requirements.push({ ownerPlugin, token })

		return Object.freeze({
			debugName: token.debugName,
			[requiredPluginServiceIdentity]: (service: TService): TService => service,
			get: (): TService => this.get(token),
		})
	}

	#assertToken<TService>(token: ServiceToken<TService>): void {
		const untrustedToken: unknown = token

		assertServiceToken(untrustedToken)
	}

	#trackDisposable(service: unknown): void {
		if (!isDisposableService(service) || this.#ownedDisposables.has(service)) {
			return
		}

		this.#ownedDisposables.add(service)
		this.#disposables.use(service)
	}
}

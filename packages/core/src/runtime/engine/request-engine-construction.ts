/** Only the owning framework can construct request engines. */
export const requestEngineConstructionKey: unique symbol = Symbol(
	'ultimabase.request-engine-construction',
)

// Module hook: the fixture imports the type-only model (`lib/core.ts`, `lib/plugins.ts`);
// at runtime those imports are served by the runtime stub next to this file.
const formLib = new URL('../lib/', import.meta.url).href
const runtime = new URL('./', import.meta.url).href

export const resolve = async (specifier, context, next) => {
	const result = await next(specifier, context)
	if (result.url === `${formLib}core.ts`) return { ...result, url: `${runtime}core.mjs`, format: 'module' }
	if (result.url === `${formLib}plugins.ts`) return { ...result, url: `${runtime}plugins.mjs`, format: 'module' }
	return result
}

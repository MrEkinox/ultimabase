//#region script
// `yarn deploy`: brings Stripe to the catalog, from the deploy pipeline;
// `yarn deploy --dry-run` prints the plan and changes nothing.
import { deployCatalog } from './stripe.ts'

await deployCatalog(
	process.env['STRIPE_SECRET_KEY'],
	process.argv.includes('--dry-run'),
)
//#endregion

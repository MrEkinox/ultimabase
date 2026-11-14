---
'@ultimabase/stripe': patch
---

A subscription's row no longer keeps `scheduledProduct`, `scheduledPrice` and `scheduledAt` once the
scheduled phase has begun at Stripe: the next phase is read after the one Stripe says is current,
in Stripe's time, which a test clock moves, rather than by the server's clock.

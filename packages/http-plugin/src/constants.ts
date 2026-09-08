/** Selects one exact public HTTP application without granting authority. */
export const httpApplicationIdHeader = 'X-UltimaBase-Application-Id'
/** Reserves the only path namespace allowed to bootstrap one browser UI. */
export const httpBrowserBootstrapPathPrefix = '/__ultimabase/apps'

/** Selects audited Master verification only when explicitly enabled. */
export const httpMasterKeyHeader = 'X-UltimaBase-Master-Key'

/** Carries validated or generated request correlation on every response. */
export const httpRequestIdHeader = 'X-UltimaBase-Request-Id'

/** Versions the provider-facing application graph independently from packages. */
export const httpApplicationProtocolVersion = '1.0.0'

/** Requires evidence captured before Fetch combines repeated header fields. */
export const httpOriginalHeaderMode = 'ordered-pairs'

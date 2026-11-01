/** Provider-neutral types. Pure (no Deno APIs) so operations can be unit-tested with a fake provider. */

export interface CompleteArgs {
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs: number;
}

export interface LlmProvider {
  /** Returns the parsed JSON object from the model reply. Throws ProviderError on any failure. */
  completeJson(args: CompleteArgs): Promise<unknown>;
}

export type ProviderErrorKind =
  | 'timeout'
  | 'rate_limited'
  | 'provider_error'
  | 'invalid_output'
  | 'not_configured'
  /** The provider rejected the API key (401/403). */
  | 'unauthorized'
  /** The request never reached the provider (no network). */
  | 'offline';

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message?: string,
  ) {
    super(message ?? kind);
  }
}

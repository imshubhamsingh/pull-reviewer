import type { Provider } from '@/main/tour/cli-runner.service'

export interface ModelSelection {
  provider: Provider
  model: string
}

/**
 * Catalog of (provider, model) defaults. Centralised so model upgrades and provider
 * additions touch one file. Injectable so tests can stub a different default set.
 */
export class ModelCatalog {
  private readonly defaultProvider: Provider = 'claude'

  private readonly defaultModelByProvider: Record<Provider, string> = {
    claude: 'claude-sonnet-4-6',
    codex: 'gpt-5-codex',
  }

  /** Resolve user-supplied (possibly undefined) provider/model to concrete values. */
  resolve(opts: { provider?: Provider; model?: string }): ModelSelection {
    const provider = opts.provider ?? this.defaultProvider
    return {
      provider,
      model: opts.model ?? this.defaultModelByProvider[provider],
    }
  }

  /** Default model for a given provider — exposed for cases that already have a Provider. */
  defaultFor(provider: Provider): string {
    return this.defaultModelByProvider[provider]
  }
}

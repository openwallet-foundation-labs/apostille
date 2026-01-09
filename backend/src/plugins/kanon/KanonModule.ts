import type { Module, AgentContext, DependencyManager } from "@credo-ts/core";

import { EthereumLedgerService } from "./ledger";
import {
  KanonModuleConfig,
  KanonModuleConfigOptions
} from "./KanonModuleConfig";

export class EthereumModule implements Module {
  public readonly config: KanonModuleConfig;

  public constructor(configOptions: KanonModuleConfigOptions) {
    this.config = new KanonModuleConfig(configOptions);
  }

  public register(dependencyManager: DependencyManager) {
    dependencyManager.registerInstance(KanonModuleConfig, this.config);
    dependencyManager.registerSingleton(EthereumLedgerService);
  }

  public async initialize(agentContext: AgentContext): Promise<void> {
    const ethereumLedgerService = agentContext.dependencyManager.resolve(
      EthereumLedgerService
    );

  }
}

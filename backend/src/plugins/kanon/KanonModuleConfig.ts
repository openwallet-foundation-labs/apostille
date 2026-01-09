export interface KanonModuleConfigOptions {
  networks: NetworkConfig[];
}

export interface NetworkConfig {
  rpcUrl?: string;
  privateKey: string;
  network: string;
}

export class KanonModuleConfig {
  private options: KanonModuleConfigOptions;

  public constructor(options: KanonModuleConfigOptions) {
    this.options = options;
  }


  public get networks() {
    return this.options.networks;
  }
}

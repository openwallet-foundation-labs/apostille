import { ethers } from "ethers";
import { DidDocument, inject, injectable, Logger } from "@credo-ts/core";
import { KanonModuleConfig } from "../KanonModuleConfig";

export interface IEthereumLedgerConfig {
  network: string;
  providerUrl: string;
  privateKey: string;
}

export enum DefaultProviderUrl {
  mainnet = "https://eth-sepolia-public.unifra.io",
  sepolia = "https://eth-sepolia-public.unifra.io",

}

@injectable()
export class EthereumLedgerService {
  private networks: IEthereumLedgerConfig[];
  private contractAddress: string =
    "0x71A331a8F293440F0bd062a02fa0a880Ee2006fC";
  private abi: any[] = [
    "function registerDID(string,string,string)",
    "function updateDID(string,string,string)",
    "function getDID(string) view returns (string, string)",
    "function registerSchema(string,string,string)",
    "function addApprovedIssuer(string,address)",
    "function getSchema(string) view returns (string, address[])",
    "function registerCredentialDefinition(string,string,string,string)",
    "function getCredentialDefinition(string) view returns (string, string, string)",
    "function revokeCredential(string)",
    "function isCredentialRevoked(string) view returns (bool)"
  ];

  public constructor(config: KanonModuleConfig) {
    this.networks = config.networks.map((config) => {
      const { network, rpcUrl, privateKey } = config;
      return {
        network,
        providerUrl: rpcUrl || DefaultProviderUrl.sepolia,
        privateKey,
      };
    });
  }

  private async getProviderAndSigner(networkName: string): Promise<{
    provider: ethers.JsonRpcProvider;
    signer: ethers.Wallet;
  }> {
    console.log("Getting provider and signer for network:", networkName);
    try {

      const network = this.networks.find((n) => n.network === networkName) || this.networks[0];
      if (!network) {
        throw new Error(`No network configuration available. Please check your configuration.`);
      }
      
      console.log(`Using network: ${network.network}, provider: ${network.providerUrl}`);
      const provider = new ethers.JsonRpcProvider(network.providerUrl);
      

      await provider.getBlockNumber().catch(error => {
        console.error("Provider connection failed:", error);
        throw new Error(`Failed to connect to provider at ${network.providerUrl}: ${error.message}`);
      });
      
      const signer = new ethers.Wallet(network.privateKey, provider);
      console.log("Signer address:", await signer.getAddress());
      
      return { provider, signer };
    } catch (error: any) {
      console.error("Error getting provider and signer:", error);
      throw new Error(`Failed to initialize provider and signer: ${error.message}`);
    }
  }

  public async executeDIDOperation(
    operation: "create" | "update" | "deactivate",
    identifier: string,
    networkName: string,
    didDoc: string,
    metadata?: string
  ) {
    const { signer } = await this.getProviderAndSigner(networkName);
    const contract = new ethers.Contract(
      this.contractAddress,
      this.abi,
      signer
    );

    let transactionResponse;

    switch (operation) {
      case "create":
        console.log("Creating DID", identifier, didDoc, metadata);
        transactionResponse = await contract.registerDID(
          identifier,
          didDoc,
          metadata || ""
        );
        break;
      case "update":
        transactionResponse = await contract.updateDID(
          identifier,
          didDoc,
          metadata || ""
        );
        break;
      case "deactivate":
        transactionResponse = await contract.deactivateDID(identifier);
        break;
      default:
        throw new Error(`Invalid operation: ${operation}`);
    }
    return transactionResponse.wait(); // wait for the transaction to be mined
  }

  async getDIDDocument(
    did: string,
    networkName: string = "mainnet"
  ): Promise<DidDocument | undefined> {
    const { signer } = await this.getProviderAndSigner(networkName);
    const contract = new ethers.Contract(
      this.contractAddress,
      this.abi,
      signer
    );
    const document = await contract.getDID(did);
    if (!document) {
      return undefined;
    }
    console.log(document, "documentdsdd");
    const didDoc = document[0];
    const metadata = document[1];
    let didDocument: DidDocument;

    if (didDoc) {
      const json = JSON.parse(didDoc);
      didDocument = new DidDocument({
        id: did,
        context: json.context,
        service: json.service,
      });
    } else {
      didDocument = new DidDocument({
        id: did,
        context: "",
        service: [],
      });
    }

    if (metadata !== "") {
    }

    return didDocument;
  }

  async getDID(did: string, networkName: string = "mainnet") {
    try {
      const { provider } = await this.getProviderAndSigner(networkName);
      

      const iface = new ethers.Interface([
        "function getDID(string) view returns (string, string)"
      ]);
      

      const data = iface.encodeFunctionData("getDID", [did]);
      

      const result = await provider.call({
        to: this.contractAddress,
        data: data
      });
      

      const decoded = iface.decodeFunctionResult("getDID", result);
      return decoded;
    } catch (error: any) {
      console.error("Failed to get DID:", error);
      throw new Error(`Failed to get DID: ${error.message || error}`);
    }
  }

  async getSchema(schemaId: string, networkName: string = "mainnet") {
    console.log(schemaId, "schemaId");
    try {
      const { provider } = await this.getProviderAndSigner(networkName);
      

      const iface = new ethers.Interface([
        "function getSchema(string) view returns (string, address[])"
      ]);
      

      const data = iface.encodeFunctionData("getSchema", [schemaId]);
      

      const result = await provider.call({
        to: this.contractAddress,
        data: data
      });
      

      const decoded = iface.decodeFunctionResult("getSchema", result);
      const response = decoded;
      console.log(response, "resdvponse");
      console.log(response[0], "response[0]");
      try {
        let Json = JSON.parse(response[0]);
        console.log(Json.data.data.attrNames, "Json");
        return {
          schema: {
            attrNames: Json.data.data.attrNames,
            name: Json.data.data.name,
            version: Json.data.data.version,
            issuerId: Json.data.data.issuerId,
          },
          schemaId,
          resolutionMetadata: {},
          schemaMetadata: {},
          approvedIssuers: response[1] || []
        };
      } catch (e) {
        console.error("Error parsing schema JSON:", e);
        return {
          schema: {
            attrNames: [],
            name: "",
            version: "",
            issuerId: "",
          },
          schemaId,
          resolutionMetadata: {},
          schemaMetadata: {},
          approvedIssuers: []
        };
      }
    } catch (error: any) {
      console.error("Failed to get schema:", error);
      throw new Error(`Failed to get schema: ${error.message || error}`);
    }
  }

  async registerSchema(
    schemaId: string,
    details: string,
    networkName: string,
    issuerId: string
  ) {
    const { signer } = await this.getProviderAndSigner(networkName);
    
    try {

      if (!schemaId) throw new Error("schemaId cannot be null or empty");
      if (!details) throw new Error("details cannot be null or empty");
      if (!issuerId) throw new Error("issuerId cannot be null or empty");
      
      console.log("Registering schema with parameters:", {
        schemaId,
        detailsLength: details.length,
        issuerId
      });
      

      const iface = new ethers.Interface([
        "function registerSchema(string,string,string)"
      ]);
      

      const data = iface.encodeFunctionData("registerSchema", [
        schemaId,
        details,
        issuerId
      ]);
      

      const tx = await signer.sendTransaction({
        to: this.contractAddress,
        data: data
      });
      
      console.log("Transaction sent:", tx.hash);
      const receipt = await tx.wait();
      console.log("Receipt:", receipt);
      
      if (receipt && receipt.status === 1) {
        return receipt;
      } else {
        throw new Error("Transaction failed: status is not success");
      }
    } catch (error: any) {
      console.error("Transaction failed:", error);
      throw new Error(`Failed to register schema: ${error.message || error}`);
    }
  }

  async addApprovedIssuer(
    schemaId: string,
    issuer: string,
    networkName: string = "mainnet"
  ) {
    const { signer } = await this.getProviderAndSigner(networkName);
    
    try {
      console.log("Adding approved issuer", schemaId, issuer);
      

      const iface = new ethers.Interface([
        "function addApprovedIssuer(string,address)"
      ]);
      

      const data = iface.encodeFunctionData("addApprovedIssuer", [
        schemaId,
        issuer
      ]);
      

      const tx = await signer.sendTransaction({
        to: this.contractAddress,
        data: data
      });
      
      console.log("Transaction sent:", tx.hash);
      const receipt = await tx.wait();
      console.log("Receipt:", receipt);
      
      if (receipt && receipt.status === 1) {
        return receipt;
      } else {
        throw new Error("Transaction failed: status is not success");
      }
    } catch (error: any) {
      console.error("Failed to add approved issuer:", error);
      throw new Error(`Failed to add approved issuer: ${error.message || error}`);
    }
  }

  async registerCredentialDefinition(
    credDefId: string,
    schemaId: string,
    issuer: string,
    detailsJson: string,
    networkName: string = "mainnet"
  ) {
    const { signer } = await this.getProviderAndSigner(networkName);
    
    try {

      if (!credDefId) throw new Error("credDefId cannot be null or empty");
      if (!schemaId) throw new Error("schemaId cannot be null or empty");
      if (!issuer) throw new Error("issuer cannot be null or empty");
      
      console.log("Registering credential definition with parameters:", {
        credDefId,
        schemaId,
        issuer,
        detailsJson
      });
      

      const iface = new ethers.Interface([
        "function registerCredentialDefinition(string,string,string,string)"
      ]);
      

      const data = iface.encodeFunctionData("registerCredentialDefinition", [
        credDefId,
        schemaId,
        issuer,
        detailsJson
      ]);
      

      const tx = await signer.sendTransaction({
        to: this.contractAddress,
        data: data
      });
      
      console.log("Transaction sent:", tx.hash);
      const receipt = await tx.wait();
      console.log("Receipt:", receipt);
      
      
      if (receipt && receipt.status === 1) {
        return receipt;
      } else {
        throw new Error("Transaction failed: status is not success");
      }
    } catch (error: any) {
      console.error("Transaction failed:", error);
      throw new Error(`Failed to register credential definition: ${error.message || error}`);
    }
  }

  async getCredentialDefinition(
    credDefId: string,
    networkName: string = "testnet"
  ) {
    try {
      const { provider } = await this.getProviderAndSigner(networkName);
      
      console.log(credDefId, "credDefId");
      const iface = new ethers.Interface([
        "function getCredentialDefinition(string) view returns (string, string, string)"
      ]);
      

      const data = iface.encodeFunctionData("getCredentialDefinition", [credDefId]);
      console.log(data, "datadfsdf");

      const result = await provider.call({
        to: this.contractAddress,
        data: data
      });
      

      const response = iface.decodeFunctionResult("getCredentialDefinition", result);
      console.log(response, "responsesdfdf");
      return response;
    } catch (error: any) {
      console.error("Failed to get credential definition:", error);
      throw new Error(`Failed to get credential definition: ${error.message || error}`);
    }
  }

  async issueCredential(
    credId: string,
    credDefId: string,
    issuer: string,
    subject: string,
    issuanceDate: string,
    expiryDate: string,
    metadata: string,
    networkName: string = "mainnet"
  ) {
    const { signer } = await this.getProviderAndSigner(networkName);
    const contract = new ethers.Contract(
      this.contractAddress,
      this.abi,
      signer
    );
    return contract.issueCredential(
      credId,
      credDefId,
      issuer,
      subject,
      issuanceDate,
      expiryDate,
      metadata
    );
  }

  async revokeCredential(credId: string, networkName: string = "mainnet") {
    const { signer } = await this.getProviderAndSigner(networkName);
    
    try {
      console.log("Revoking credential", credId);
      

      const iface = new ethers.Interface([
        "function revokeCredential(string)"
      ]);
      

      const data = iface.encodeFunctionData("revokeCredential", [credId]);
      

      const tx = await signer.sendTransaction({
        to: this.contractAddress,
        data: data
      });
      
      console.log("Transaction sent:", tx.hash);
      const receipt = await tx.wait();
      console.log("Receipt:", receipt);
      
      if (receipt && receipt.status === 1) {
        return receipt;
      } else {
        throw new Error("Transaction failed: status is not success");
      }
    } catch (error: any) {
      console.error("Failed to revoke credential:", error);
      throw new Error(`Failed to revoke credential: ${error.message || error}`);
    }
  }

  async isCredentialRevoked(credId: string, networkName: string = "mainnet") {
    try {
      const { provider } = await this.getProviderAndSigner(networkName);
      

      const iface = new ethers.Interface([
        "function isCredentialRevoked(string) view returns (bool)"
      ]);
      

      const data = iface.encodeFunctionData("isCredentialRevoked", [credId]);
      

      const result = await provider.call({
        to: this.contractAddress,
        data: data
      });
      

      const decoded = iface.decodeFunctionResult("isCredentialRevoked", result);
      return decoded[0];
    } catch (error: any) {
      console.error("Failed to check if credential is revoked:", error);
      throw new Error(`Failed to check if credential is revoked: ${error.message || error}`);
    }
  }

  async registerDID(
    did: string,
    context: string,
    metadata: string,
    networkName: string = "mainnet"
  ) {
    const { signer } = await this.getProviderAndSigner(networkName);
    
    try {
      console.log("Registering DID", did, context);
      

      const iface = new ethers.Interface([
        "function registerDID(string,string,string)"
      ]);
      

      const data = iface.encodeFunctionData("registerDID", [
        did,
        context,
        metadata
      ]);
      

      const tx = await signer.sendTransaction({
        to: this.contractAddress,
        data: data
      });
      
      console.log("Transaction sent:", tx.hash);
      const receipt = await tx.wait();
      console.log("Receipt:", receipt);
      
      if (receipt && receipt.status === 1) {
        return receipt;
      } else {
        throw new Error("Transaction failed: status is not success");
      }
    } catch (error: any) {
      console.error("Failed to register DID:", error);
      throw new Error(`Failed to register DID: ${error.message || error}`);
    }
  }

  async updateDID(
    did: string,
    context: string,
    metadata: string,
    networkName: string = "mainnet"
  ) {
    const { signer } = await this.getProviderAndSigner(networkName);
    
    try {
      console.log("Updating DID", did, context);
      

      const iface = new ethers.Interface([
        "function updateDID(string,string,string)"
      ]);
      

      const data = iface.encodeFunctionData("updateDID", [
        did,
        context,
        metadata
      ]);
      

      const tx = await signer.sendTransaction({
        to: this.contractAddress,
        data: data
      });
      
      console.log("Transaction sent:", tx.hash);
      const receipt = await tx.wait();
      console.log("Receipt:", receipt);
      
      if (receipt && receipt.status === 1) {
        return receipt;
      } else {
        throw new Error("Transaction failed: status is not success");
      }
    } catch (error: any) {
      console.error("Failed to update DID:", error);
      throw new Error(`Failed to update DID: ${error.message || error}`);
    }
  }
}

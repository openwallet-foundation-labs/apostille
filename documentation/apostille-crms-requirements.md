# Apostille Credential Management System

## Software Requirements Document

**Version:** 1.0
 **Status:** Draft
 **Prepared by:** Ajna Inc. / VeriDID Corp.
 **Target Foundation:** Open Wallet Foundation (OWF)

------

## 1. Introduction

### 1.1 Purpose

This Software Requirements Document (SRD) specifies the functional and non-functional requirements for the Apostille Credential Management System (CrMS). It is intended to guide the design, development, and validation of the system.

### 1.2 Scope

Apostille is a DIDComm-focused, credential-type-agnostic Credential Management System that supports both credential issuance and verification through configurable workflows and direct credential exchange standards. It is designed to be modular, extensible, and highly configurable, enabling task-focused deployments across diverse industry sectors.

### 1.3 Definitions and Acronyms

| Term    | Definition                                      |
| ------- | ----------------------------------------------- |
| CrMS    | Credential Management System                    |
| DIDComm | Decentralized Identifier Communication protocol |
| RBAC    | Role-Based Access Control                       |
| PEP     | Policy Enforcement Point                        |
| VDR     | Verifiable Data Registry                        |
| KMS     | Key Management System                           |
| OCA     | Overlay Capture Architecture                    |
| OIDC    | OpenID Connect                                  |
| TOTP    | Time-based One-time Password                    |
| MFA     | Multi-Factor Authentication                     |
| SSO     | Single Sign-On                                  |
| OWF     | Open Wallet Foundation                          |
| mDL     | Mobile Driver's License                         |
| W3C VC  | W3C Verifiable Credential                       |

### 1.4 References

- DIDComm Messaging Specification (DIF)
- W3C Verifiable Credentials Data Model
- OpenID for Verifiable Credential Issuance (OID4VCI)
- OpenID for Verifiable Presentations (OID4VP)
- AnonCreds Specification
- ISO-27560 / ISO-29184 Consent Records
- DIDComm Workflow 1.0 Protocol
- Open Wallet Foundation Charter

------

## 2. System Overview

Apostille operates as either a workflow server or a workflow client depending on deployment configuration. It extends the functional boundaries of traditional credential management systems by leveraging advanced DIDComm workflows and emerging open standards within the verifiable credentials ecosystem.

### 2.1 High-Level Goals

- Provide an open-source, interoperable CrMS under OWF governance.
- Support multi-tenant deployments for organizations with subdivisions (e.g., school districts, government ministries, corporate divisions).
- Enable modular, extensible credential issuance and verification workflows.
- Enforce enterprise-grade security, privacy, and compliance requirements.

------

## 3. Stakeholders and Users

| Role                   | Description                                                  |
| ---------------------- | ------------------------------------------------------------ |
| System Administrator   | Configures tenants, modules, authentication, and global policies |
| Tenant Administrator   | Manages tenant-specific users, workflows, and credentials    |
| Issuer                 | Issues credentials to holders via workflows or direct exchange |
| Verifier               | Requests and verifies credential presentations               |
| Credential Holder      | End user receiving or presenting credentials via a wallet    |
| Workflow Designer      | Creates and manages workflow templates                       |
| Compliance Officer     | Reviews audit logs and consent records                       |
| Developer / Integrator | Extends the system via module development                    |

------

## 4. System Architecture Requirements

### 4.1 Modularity

**REQ-ARCH-001:** The system shall be designed as a modular platform where credential types, wallet storage mechanisms, credential exchange protocols, and integrations are implemented as independent, swappable modules.

**REQ-ARCH-002:** Modules shall be loadable, removable, and replaceable at runtime without requiring a system rebuild.

**REQ-ARCH-003:** Each module shall provide a manifest declaring its configuration, capabilities, and integration points.

**REQ-ARCH-004:** The core system shall depend on abstract module interfaces, not concrete implementations (dependency injection pattern).

**REQ-ARCH-005:** Modules shall be capable of providing mock implementations to support development and testing in isolation.

### 4.2 REST API Modularity

**REQ-API-001:** Each module shall define and expose its own OpenAPI specification.

**REQ-API-002:** The system shall aggregate all module OpenAPI specifications into a unified interface available through the API Gateway.

**REQ-API-003:** API definitions shall remain localized to their implementing module while contributing to the unified system interface.

### 4.3 Server-Side Modularity

**REQ-SRV-001:** Server modules shall be integrated using a dependency injection framework.

**REQ-SRV-002:** The system shall support centralized control over module configuration manifests.

**REQ-SRV-003:** Modules shall be independently testable without requiring the full system to be running.

### 4.4 Web Application Modularity

**REQ-WEB-001:** The web application shall leverage Webpack Module Federation to support independently deployable frontend modules that load dynamically at runtime.

**REQ-WEB-002:** The frontend module system shall support multiple UI frameworks (e.g., React, Vue, Angular) within the same application shell.

**REQ-WEB-003:** The module federation implementation shall enforce consistent Node.js version alignment across module boundaries.

**REQ-WEB-004:** Frontend modules shall support lazy loading to minimize initial application bundle size.

------

## 5. Multitenancy Requirements

**REQ-MT-001:** The system shall support multi-tenant deployments for related organizations operating under shared governance or coordinating structures.

**REQ-MT-002:** Each tenant shall have isolated user accounts and access control management.

**REQ-MT-003:** Each tenant shall have segregated wallet storage for credential data.

**REQ-MT-004:** Each tenant shall support independent workflow configurations and process definitions.

**REQ-MT-005:** Each tenant shall support dedicated integrations with external systems.

**REQ-MT-006:** Each tenant shall have controlled access to a configurable set of enabled modules.

**REQ-MT-007:** Each tenant shall be uniquely identified through a dedicated domain name or URL path.

**REQ-MT-008:** The system shall support configurable cross-tenant capabilities including shared administrative accounts, controlled database access, and consolidated multi-tenant reporting.

**REQ-MT-009:** All tenants shall share the same underlying infrastructure including the VM environment, core agent services, module manifests, and baseline policy framework.

**REQ-MT-010:** The system shall support single-tenant deployment with simplified tenant context handling while retaining the same architectural foundation.

------

## 6. Authentication Requirements

### 6.1 General

**REQ-AUTH-001:** Authentication shall be implemented as a modular subsystem supporting multiple methods simultaneously.

**REQ-AUTH-002:** The system shall support Basic Authentication, SSO (federated identity), Passkeys, and Credential Access as independent, configurable authentication modules.

### 6.2 Basic Authentication

**REQ-AUTH-BA-001:** The system shall support username/password authentication with full operator control over account creation and access management.

**REQ-AUTH-BA-002:** The login interface shall present username/password fields, a login button, and a password reset link.

**REQ-AUTH-BA-003:** User records shall store or be associated with an email address for password reset functionality.

**REQ-AUTH-BA-004:** Basic authentication shall support Multi-Factor Authentication (MFA).

### 6.3 Single Sign-On (SSO)

**REQ-AUTH-SSO-001:** The system shall support SSO using OIDC, FIDO2, SAML, CAS, and Microsoft Entra.

**REQ-AUTH-SSO-002:** The system shall support federated identity using external identity providers (e.g., Google, GitHub).

**REQ-AUTH-SSO-003:** SSO authentication shall support MFA.

### 6.4 Passkeys

**REQ-AUTH-PK-001:** The system shall support passkey creation as a post-login step following a lower-assurance method (e.g., Basic Authentication or SSO).

**REQ-AUTH-PK-002:** The login interface shall include a "Sign in with Passkey" option when passkeys are enabled.

**REQ-AUTH-PK-003:** Passkey authentication shall use cryptographic key pairs protected by on-device biometrics.

### 6.5 Credential Access

**REQ-AUTH-CA-001:** The system shall support password-less login via verifiable credential presentation.

**REQ-AUTH-CA-002:** The login interface shall present a QR code representing a proof request for a staff or user ID credential when Credential Access is enabled.

**REQ-AUTH-CA-003:** Credential Access authentication shall not require MFA, as biometric protection is inherent to the credential holder's device.

### 6.6 Multi-Factor Authentication (MFA)

**REQ-MFA-001:** MFA shall be implemented as configurable modules.

**REQ-MFA-002:** The system shall support TOTP-based authenticator applications as an MFA module.

**REQ-MFA-003:** The system shall support push notification-based MFA as a module.

------

## 7. Access Control Requirements

### 7.1 RBAC

**REQ-AC-001:** The system shall implement Role-Based Access Control (RBAC) as the foundational access control layer.

**REQ-AC-002:** Permissions shall be assignable to roles (e.g., administrator, issuer, verifier).

**REQ-AC-003:** Roles shall be assignable to user accounts within the scope of a tenant.

### 7.2 Policy Enforcement

**REQ-AC-004:** The system shall implement a dynamic policy layer on top of RBAC that applies contextual constraints at runtime.

**REQ-AC-005:** Both the core system and all modules shall implement Policy Enforcement Points (PEPs).

**REQ-AC-006:** PEPs shall validate role-based permissions, evaluate dynamic policy claims, and restrict access based on contextual conditions.

**REQ-AC-007:** Each module and the core platform shall declare the permissions and dynamic claims it supports to enable centralized policy configuration.

**REQ-AC-008:** The system shall use JWT tokens (via OIDC) to convey identity attributes, role assignments, and policy-related claims for runtime authorization.

**REQ-AC-009:** The system shall integrate with enterprise SSO and organizational policy management frameworks such as Okta and ForgeRock.

------

## 8. Logging Requirements

### 8.1 General

**REQ-LOG-001:** The system shall log all activity required for application security, compliance, privacy audits, debugging, performance, and system health.

**REQ-LOG-002:** All log entries shall be in JSON format and include the following fields: timestamp, user account, IP address, log level, message, module name (or core), action, data access reference, error or exception, HTTP header, and environment (tenant, staging/production).

**REQ-LOG-003:** The system shall support log output to log files, database logging, and cloud logging to a SIEM system.

### 8.2 Access Logging

**REQ-LOG-ACC-001:** All login events shall be captured, including failed login attempts.

**REQ-LOG-ACC-002:** New user account creation and account modifications shall be logged.

**REQ-LOG-ACC-003:** Authentication log entries shall include the authentication type (e.g., OIDC, SAML, Basic, Verifiable Credential).

**REQ-LOG-ACC-004:** Log messages shall include actionable insights to assist reviewers in identifying and responding to anomalies.

### 8.3 Permission Logging

**REQ-LOG-PRM-001:** All Policy Enforcement Point decisions shall be logged.

**REQ-LOG-PRM-002:** Permission log messages shall capture the dynamic conditions under which the policy was evaluated and the resulting decision.

### 8.4 Data Access Logging

**REQ-LOG-DA-001:** All calls to data sources shall be logged to track which user requested which data.

**REQ-LOG-DA-002:** PII shall not be recorded in log messages; a unique data identifier shall be used in place of PII.

### 8.5 Configuration Logging

**REQ-LOG-CFG-001:** All changes to system configuration shall be logged, with particular emphasis on changes to authentication levels required for accessing resources.

**REQ-LOG-CFG-002:** Configuration change log messages shall capture both the prior state and the new state of the change.

### 8.6 Error Logging

**REQ-LOG-ERR-001:** Errors on calling functions and caught exceptions shall be logged.

**REQ-LOG-ERR-002:** Error log messages shall include the error message, contextual details (e.g., the file name, path, and reason it was required), and sufficient context for a reviewer to understand the impact and cause.

------

## 9. API Gateway Requirements

**REQ-GW-001:** The system deployment shall include an API Gateway, configured either as a cloud service or using self-hosted solutions such as Caddy with Lura or Traefik.

**REQ-GW-002:** The API Gateway shall centralize security enforcement and offload security responsibilities from the application layer.

**REQ-GW-003:** The API Gateway shall function as a reverse proxy.

**REQ-GW-004:** The API Gateway shall serve as an SSL/TLS termination endpoint.

------

## 10. Credential Exchange Requirements

**REQ-CE-001:** Each credential exchange method shall be implemented as an independent module.

### 10.1 DIDComm

**REQ-CE-DC-001:** The system shall support DIDComm for agent-to-agent connections, credential transport, and encryption of data in transit.

**REQ-CE-DC-002:** The DIDComm module shall support AnonCreds credential exchange.

**REQ-CE-DC-003:** The system shall support the following DIDComm-based protocols as modules: Workflow 1.0, Signing 1.0, Vault 1.0, and WebRTC 1.0.

### 10.2 OID4VCI / OID4VP

**REQ-CE-OID-001:** The system shall support OID4VCI and OID4VP for issuance and verification of AnonCreds, OpenBadges, W3C VC, and mDL credentials.

### 10.3 JOSE / COSE

**REQ-CE-JC-001:** The system shall support JOSE and COSE as modules for securing JSON and CBOR credential data transmitted over insecure channels.

------

## 11. Key Management Requirements

**REQ-KMS-001:** The system shall support modular Key Management System (KMS) integration.

**REQ-KMS-002:** The system shall provide a KMS module using Askar, independent of any cloud provider.

**REQ-KMS-003:** The system shall provide KMS modules for AWS, Azure, and GCP cloud-hosted key management services.

------

## 12. Wallet Requirements

### 12.1 Credential Wallet

**REQ-WALL-001:** The system shall maintain a credential wallet (database) that stores AnonCreds, W3C VC, and mDOCS credentials, along with credential issuance and verification activity records.

### 12.2 Crypto Wallet

**REQ-WALL-002:** The system shall support Ethereum and Ajna Blockchain crypto wallets, with planned future support for Avalanche, Cosmos, and Solana.

### 12.3 Crypto Vault (MPC Wallet)

**REQ-WALL-003:** The system shall support a Multi-Party Computation (MPC) wallet as a Crypto Vault.

**REQ-WALL-004:** The Crypto Vault shall support wallet segmentation to divide funds based on function.

**REQ-WALL-005:** The Crypto Vault shall integrate with cloud KMS for secrets or a hardware security module for management and signing.

**REQ-WALL-006:** The Crypto Vault shall support mobile wallet credentials with biometric authentication as MFA.

**REQ-WALL-007:** The Crypto Vault shall maintain a comprehensive audit trail.

**REQ-WALL-008:** The Crypto Vault shall have clearly defined disaster recovery requirements and procedures.

------

## 13. Channel Management Requirements

**REQ-CH-001:** The system shall manage DIDComm channels (connections) between agents and expose connection state, status, and activity information.

**REQ-CH-002:** The system shall support the following invitation types: Out-of-Band (OOB), workflow connections, mobile deep links, shortened URLs, QR codes, and BLE.

**REQ-CH-003:** The system shall provide a connection list view displaying status, metadata, issued credentials, verifications, workflow instances, and workflow-gathered data for each connection.

------

## 14. Workflow Management Requirements

### 14.1 Workflow Templates

**REQ-WF-001:** Workflows shall be implemented as DIDComm Workflow 1.0 protocol state machines stored as JSON.

**REQ-WF-002:** The system shall support creation and editing of workflow templates.

**REQ-WF-003:** Workflow templates shall support versioning and deployment states.

**REQ-WF-004:** Workflow templates shall support RBAC to control who can create, edit, deploy, and execute workflows.

**REQ-WF-005:** Workflow templates shall include metadata describing how they are displayed and interacted with in Apostille.

### 14.2 Workflow Instances

**REQ-WF-006:** The system shall create an instance record for each started workflow.

**REQ-WF-007:** The system shall provide a list view of workflow instances per workflow template, accessible from the CrMS navigation menu.

**REQ-WF-008:** Workflow instance detail views shall display the current state, context and artifact data, and the full history of state transitions.

**REQ-WF-009:** The system shall provide a dashboard of workflow activity.

### 14.3 Visual Workflow Editor

**REQ-WF-010:** The system shall include a visual editor for creating and editing workflow JSON templates.

**REQ-WF-011:** The visual editor shall support creating new states as nodes and defining transitions as edges (vertices) between nodes.

**REQ-WF-012:** The visual editor shall support placing guards on transitions.

**REQ-WF-013:** The visual editor shall include a preview mode that renders a mockup of the workflow as it would appear on a mobile device.

------

## 15. Credential Management Requirements

### 15.1 Credential Definitions

**REQ-CRED-001:** The system shall provide a grid list view for AnonCreds, OpenBadges, and mDL credential definitions.

**REQ-CRED-002:** Selecting a credential definition from the grid shall open a detail view allowing editing of the CrMS metadata for that credential.

### 15.2 Issued Credentials

**REQ-CRED-003:** The system shall provide a list of all issued credentials.

**REQ-CRED-004:** Selecting an issued credential shall display its attributes, the connection over which it was issued, the issuance date, and the associated workflow.

### 15.3 Self-Attested Credentials

**REQ-CRED-005:** The system shall allow users to self-attest to a credential and submit it for endorsement by another organization or individual.

### 15.4 Verified Credentials

**REQ-CRED-006:** The system shall provide a list of all credential verifications.

**REQ-CRED-007:** Selecting a verification shall display the connection used, attributes verified, pass/fail result, and the associated workflow.

### 15.5 Revocation

**REQ-CRED-008:** The system shall support revocation of credentials that include revocation support in their credential type or definition.

### 15.6 Endorsement

**REQ-CRED-009:** The system shall support endorsement workflows where a holder presents a self-attested credential for endorsement.

**REQ-CRED-010:** Endorsements shall capture the endorsing organization's information and a cryptographic signature.

**REQ-CRED-011:** Endorsement shall be natively supported for OpenBadges and implemented via an equivalent mechanism for AnonCreds.

### 15.7 Disclosure Negotiation

**REQ-CRED-012:** The system shall support disclosure negotiation workflows that offer holders rewards for disclosing additional credential attributes.

**REQ-CRED-013:** All credential verification workflows shall specify only the required attributes rather than requesting all attributes by default.

### 15.8 Taxonomies

**REQ-CRED-014:** The system shall support configurable taxonomies for credential attributes that represent enumerated values.

### 15.9 Privacy Vocabulary

**REQ-CRED-015:** The system shall support a Data Privacy Vocabulary for use when defining attributes in credential definitions.

------

## 16. Credential Representation Requirements

**REQ-CR-001:** Each credential representation format shall be implemented as an independent module.

### 16.1 Default Representation

**REQ-CR-002:** The default representation shall algorithmically select a complementary background color and display each attribute name and value on a card.

**REQ-CR-003:** JSON attribute values shall be deserialized and rendered in a hierarchical JSON display.

### 16.2 OCA (Overlay Capture Architecture)

**REQ-CR-004:** The system shall support uploading and generating OCA bundles for credential display, including field type labels and localized attribute labels.

### 16.3 Kanon SVG

**REQ-CR-005:** The system shall support the Kanon SVG representation, using an SVG template file with Mustache/Handlebars-style attribute tags for field substitution.

**REQ-CR-006:** The system shall include a component for creating and editing Kanon SVG template files.

### 16.4 OpenBadges Display

**REQ-CR-007:** The system shall support an OpenBadges badge image editor for creating and editing badge images associated with OpenBadges credentials.

------

## 17. Verifiable Data Registry Requirements

**REQ-VDR-001:** Each VDR integration shall be implemented as an independent module.

**REQ-VDR-002:** All VDR modules shall support creation of schemas, credential definitions, Decentralized Identifiers (DIDs), and revocation records.

### 17.1 Indy VDR

**REQ-VDR-003:** The system shall support Indy VDR and the `did:indy` DID method.

### 17.2 Kanon VDR

**REQ-VDR-004:** The system shall support Kanon VDR and the `did:kanon` DID method.

**REQ-VDR-005:** The Kanon VDR module shall support extended attributes in schemas and credential definitions and the Kanon-specific approach to credential revocation.

### 17.3 CheqD VDR

**REQ-VDR-006:** The system shall support CheqD VDR and the `did:cheqd` DID method.

------

## 18. Trust and Governance Requirements

### 18.1 Kanon Trust Registry

**REQ-TR-001:** The system shall support integration with the Kanon Trust Registry for governance and oracle-based authorization.

**REQ-TR-002:** The Trust Registry integration shall identify organizations by DID, specifying which organizations can issue credentials for a given schema and which organizations are permitted to access all credential attributes.

### 18.2 Block Anchoring

**REQ-BA-001:** The system shall support anchoring data on a blockchain (can be the VDR) by creating an on-chain transaction containing a hash of the data.

### 18.3 Auditing

**REQ-AUD-001:** The system shall support audit reports capable of reproducing credential verification using stored proof presentation information.

### 18.4 Capabilities Discovery

**REQ-CAP-001:** The system shall support capabilities discovery with other agents to determine their supported protocols and features.

### 18.5 Wallet Validation

**REQ-WV-001:** The system shall support the DIDComm PAM and PoE protocols as a module for determining whether a wallet should be trusted for connections or specific workflow actions.

------

## 19. Privacy and Consent Requirements

### 19.1 Consent Receipts

**REQ-PRIV-001:** The system shall support collection and issuance of consent records and receipts conforming to ISO-27560 and ISO-29184.

**REQ-PRIV-002:** The consent receipts interface shall provide a list of all consent records; selecting a record shall display the associated connection, core information, subject details, and workflow.

------

## 20. Notification Requirements

**REQ-NOTIF-001:** The system shall support notifications via email, SMS, DIDComm Basic Message, and on-screen display.

------

## 21. Reporting and Dashboard Requirements

### 21.1 Dashboard

**REQ-DASH-001:** The system shall provide a dashboard displaying a real-time overview of workflow activity and credential issuance and verification metrics.

### 21.2 Reports

**REQ-RPT-001:** The system shall integrate with a third-party reporting tool (e.g., Apache Superset) for custom report generation.

### 21.3 CASE Server

**REQ-CASE-001:** The system shall offer a CASE 1.1 server for storing CTDL data used in OpenBadges alignment data.

------

## 22. Integration and Extension Requirements

**REQ-INT-001:** The system shall support development and deployment of modules that integrate with external systems and databases.

### 22.1 Marketplace

**REQ-MKT-001:** The system shall support a marketplace that facilitates connections between credential holders and issuers/verifiers, as well as between holders, using brokering.

### 22.2 Brokering

**REQ-BRK-001:** The system shall support a brokering capability to match connected holders based on attribute data and configurable criteria using the Gale-Shapley Algorithm.

### 22.3 Portfolio

**REQ-PORT-001:** The system shall use the DIDComm Vault 1.0 protocol to support holder portfolio management.

------

## 23. Protocol Module Requirements

Each of the following shall be implemented as an independent module.

### 23.1 Payments

**REQ-MOD-PAY-001:** The system shall support the DIDComm Payment 1.0 protocol for cryptocurrency payments.

### 23.2 Video Calls

**REQ-MOD-VID-001:** The system shall support the DIDComm WebRTC 1.0 protocol for peer-to-peer video communication.

### 23.3 Scheduling

**REQ-MOD-SCH-001:** The system shall support integration with external calendaring systems via a scheduling module.

### 23.4 Signing

**REQ-MOD-SGN-001:** The system shall support the DIDComm Signing 1.0 protocol for signing data.

### 23.5 Vaults

**REQ-MOD-VLT-001:** The system shall support the DIDComm Vault 1.0 protocol for secure data storage.

------

## 24. Non-Functional Requirements

### 24.1 Security

**REQ-NFR-SEC-001:** All data in transit shall be encrypted using TLS 1.2 or higher.

**REQ-NFR-SEC-002:** All sensitive credentials and key material shall be stored using an approved KMS module.

**REQ-NFR-SEC-003:** The system shall follow the principle of least privilege for all user roles and service accounts.

### 24.2 Scalability

**REQ-NFR-SCL-001:** The system shall support horizontal scaling of application services.

**REQ-NFR-SCL-002:** The modular architecture shall allow individual components to be scaled independently.

### 24.3 Availability

**REQ-NFR-AVL-001:** The system shall be deployable in a highly available configuration with no single point of failure.

### 24.4 Maintainability

**REQ-NFR-MNT-001:** Modules shall be independently updatable and replaceable without requiring full system redeployment.

**REQ-NFR-MNT-002:** All modules shall include automated unit tests exercisable in isolation.

### 24.5 Interoperability

**REQ-NFR-IOP-001:** The system shall conform to published open standards for all credential exchange, DID, and protocol interactions.

**REQ-NFR-IOP-002:** The system shall be credential-type agnostic and not impose proprietary constraints on credential formats that detrimentally affect interoperability.

### 24.6 Privacy

**REQ-NFR-PRV-001:** The system shall not store PII in log records.

**REQ-NFR-PRV-002:** Credential attribute data shall only be accessible to authorized roles as governed by tenant RBAC and policy configurations.

### 24.7 Open Source

**REQ-NFR-OS-001:** The system shall be developed and maintained as an open-source project under the Open Wallet Foundation.

**REQ-NFR-OS-002:** All dependencies shall be evaluated for open-source license compatibility with the project's target license.

------

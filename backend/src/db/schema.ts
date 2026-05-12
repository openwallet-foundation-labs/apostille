// import { dbConnection } from "./driver"
import { db } from "./driver";

export type UserSchema = {
    id:string;
    email:string;
    password:string;
    tenant_id:string;
    created_at: Date;
}

export type PasswordResetTokenSchema = {
    id: string;
    user_id: string;
    token: string;
    expires_at: Date;
    used: boolean;
    created_at: Date;
}

export type CardTemplateSchema = {
    id: string;
    tenant_id: string;
    name: string;
    description: string | null;
    category: string | null;
    craft_state: Record<string, unknown>;
    oca_branding: Record<string, unknown> | null;
    oca_meta: Record<string, unknown> | null;
    card_width: number;
    card_height: number;
    thumbnail: string | null;
    created_at: Date;
    updated_at: Date;
}

export type CardAssetSchema = {
    id: string;
    tenant_id: string;
    template_id: string | null;
    asset_type: string;
    file_name: string;
    mime_type: string;
    content: string;
    width: number | null;
    height: number | null;
    created_at: Date;
}

export async function userTable() {

    const client = await db.connect()
    try {
        // Enable extension (only needs to run once)
        await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`)

        // Create table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users_credo (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) ,
                tenant_id UUID NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `)

        // const result = await client.query(`
        //     SELECT table_schema, table_name
        //     FROM information_schema.tables
        //     WHERE table_type = 'BASE TABLE'
        //     AND table_schema NOT IN ('pg_catalog', 'information_schema')
        //     ORDER BY table_schema, table_name;
        //     `)

        //     console.log(result)

        console.log("✅ User table with UUID created or already exists.")
    } catch (error: any) {
        console.log(error)
        console.error("❌ Error creating user table:", error.message)
    }finally{
        // console.log(38,client)
        client.release()
    }
}

export async function passwordResetTokensTable() {
    const client = await db.connect()
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users_credo(id) ON DELETE CASCADE,
                token VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `)

        // Create indexes for efficient queries
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_password_reset_token
            ON password_reset_tokens(token)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_password_reset_user
            ON password_reset_tokens(user_id)
        `)

        console.log("✅ Password reset tokens table created or already exists.")
    } catch (error: any) {
        console.log(error)
        console.error("❌ Error creating password reset tokens table:", error.message)
    } finally {
        client.release()
    }
}

export async function cardTemplatesTable() {
    const client = await db.connect()
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS credential_card_templates (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                category VARCHAR(100),
                craft_state JSONB NOT NULL,
                oca_branding JSONB,
                oca_meta JSONB,
                card_width INTEGER DEFAULT 340,
                card_height INTEGER DEFAULT 215,
                thumbnail TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `)

        // Create indexes for efficient queries
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_card_templates_tenant
            ON credential_card_templates(tenant_id)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_card_templates_category
            ON credential_card_templates(category)
        `)

        console.log("✅ Card templates table created or already exists.")
    } catch (error: any) {
        console.log(error)
        console.error("❌ Error creating card templates table:", error.message)
    } finally {
        client.release()
    }
}

export async function cardAssetsTable() {
    const client = await db.connect()
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS credential_card_assets (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                template_id UUID REFERENCES credential_card_templates(id) ON DELETE SET NULL,
                asset_type VARCHAR(50) NOT NULL,
                file_name VARCHAR(255) NOT NULL,
                mime_type VARCHAR(100) NOT NULL,
                content TEXT NOT NULL,
                width INTEGER,
                height INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `)

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_card_assets_tenant
            ON credential_card_assets(tenant_id)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_card_assets_template
            ON credential_card_assets(template_id)
        `)

        console.log("✅ Card assets table created or already exists.")
    } catch (error: any) {
        console.log(error)
        console.error("❌ Error creating card assets table:", error.message)
    } finally {
        client.release()
    }
}

export async function initializeCredentialDesignerTables() {
    await cardTemplatesTable()
    await cardAssetsTable()
    console.log("✅ Credential designer tables initialized.")
}

// OID4VC Types
export type Oid4vciPendingOfferSchema = {
    id: string;
    tenant_id: string;
    credential_definition_id: string;
    credential_configuration_id: string;
    credential_data: Record<string, unknown>;
    pre_authorized_code: string;
    tx_code: string | null;
    access_token: string | null;
    c_nonce: string | null;
    status: 'pending' | 'token_issued' | 'credential_request_received' | 'credential_issued' | 'expired';
    format: 'vc+sd-jwt' | 'mso_mdoc' | 'anoncreds' | 'jwt_vc_json' | 'jwt_vc_json-ld' | 'ldp_vc' | 'openbadge_v3' | null;  // credential format
    doctype: string | null;  // for mdoc: e.g., 'org.iso.18013.5.1.mDL'
    cred_def_id: string | null;             // anoncreds: credential definition id
    anoncreds_offer: Record<string, unknown> | null;  // anoncreds: { schema_id, cred_def_id, nonce, key_correctness_proof }
    rev_reg_id: string | null;              // anoncreds: revocation registry id
    wire_trace: Record<string, unknown> | null;       // captured wire payloads for the inspector
    vc_contexts: string[] | null;           // jwt_vc_json-ld / ldp_vc / openbadge_v3
    vc_types: string[] | null;              // jwt_vc_json / jwt_vc_json-ld / ldp_vc / openbadge_v3
    achievement: Record<string, unknown> | null;  // openbadge_v3 achievement template
    created_at: Date;
    expires_at: Date;
    issued_at: Date | null;
}

export type Oid4vpVerificationSessionSchema = {
    id: string;
    tenant_id: string;
    verifier_id: string;
    presentation_definition: Record<string, unknown>;
    nonce: string;
    state: string;
    status: 'pending' | 'received' | 'verified' | 'failed';
    vp_token: string | null;
    verified_claims: Record<string, unknown> | null;
    created_at: Date;
    expires_at: Date;
    completed_at: Date | null;
}

export type CredentialDefinitionSchema = {
    id: string;
    tenant_id: string;
    credential_definition_id: string;
    schema_id: string;
    tag: string;
    format: 'anoncreds' | 'oid4vc' | 'mso_mdoc' | 'jwt_vc_json' | 'jwt_vc_json-ld' | 'ldp_vc' | 'openbadge_v3';
    overlay: Record<string, unknown> | null;
    schema_attributes: string[] | null;
    // mdoc-specific fields
    doctype: string | null;  // e.g., 'org.iso.18013.5.1.mDL'
    namespaces: Record<string, Record<string, unknown>> | null;  // mdoc namespace definitions
    // W3C VC / OBv3 fields
    vc_contexts: string[] | null;           // JSON-LD @context list for ldp_vc / openbadge_v3 / jwt_vc_json-ld
    vc_types: string[] | null;              // VC type[] list
    achievement: Record<string, unknown> | null;  // openbadge_v3 achievement template
    proof_suite: string | null;             // ldp_vc proof suite name (default Ed25519Signature2020)
    signing_alg: string | null;             // jwt_vc_json signing algorithm (default EdDSA)
    created_at: Date;
    updated_at: Date;
}

/**
 * Create OID4VCI pending offers table
 */
export async function oid4vciPendingOffersTable() {
    const client = await db.connect()
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS oid4vci_pending_offers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                credential_definition_id TEXT NOT NULL,
                credential_configuration_id TEXT NOT NULL,
                credential_data JSONB NOT NULL,
                pre_authorized_code TEXT NOT NULL,
                tx_code VARCHAR(10),
                access_token TEXT,
                c_nonce TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                format VARCHAR(32),
                doctype VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                issued_at TIMESTAMP
            )
        `)

        // Create indexes for efficient queries
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_oid4vci_offers_tenant
            ON oid4vci_pending_offers(tenant_id)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_oid4vci_offers_pre_auth_code
            ON oid4vci_pending_offers(pre_authorized_code)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_oid4vci_offers_access_token
            ON oid4vci_pending_offers(access_token)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_oid4vci_offers_status
            ON oid4vci_pending_offers(status)
        `)

        // Add columns for existing tables (idempotent)
        await client.query(`
            ALTER TABLE oid4vci_pending_offers
            ADD COLUMN IF NOT EXISTS format VARCHAR(32)
        `)
        await client.query(`
            ALTER TABLE oid4vci_pending_offers
            ADD COLUMN IF NOT EXISTS doctype VARCHAR(255)
        `)
        // AnonCreds OID4VCI columns
        await client.query(`
            ALTER TABLE oid4vci_pending_offers
            ADD COLUMN IF NOT EXISTS cred_def_id TEXT
        `)
        await client.query(`
            ALTER TABLE oid4vci_pending_offers
            ADD COLUMN IF NOT EXISTS anoncreds_offer JSONB
        `)
        await client.query(`
            ALTER TABLE oid4vci_pending_offers
            ADD COLUMN IF NOT EXISTS rev_reg_id TEXT
        `)
        await client.query(`
            ALTER TABLE oid4vci_pending_offers
            ADD COLUMN IF NOT EXISTS wire_trace JSONB
        `)
        // W3C VC / OBv3 OID4VCI columns
        await client.query(`
            ALTER TABLE oid4vci_pending_offers
            ADD COLUMN IF NOT EXISTS vc_contexts JSONB
        `)
        await client.query(`
            ALTER TABLE oid4vci_pending_offers
            ADD COLUMN IF NOT EXISTS vc_types JSONB
        `)
        await client.query(`
            ALTER TABLE oid4vci_pending_offers
            ADD COLUMN IF NOT EXISTS achievement JSONB
        `)
        // Widen format column to fit longer enum values like 'jwt_vc_json-ld' / 'openbadge_v3'
        await client.query(`
            ALTER TABLE oid4vci_pending_offers
            ALTER COLUMN format TYPE VARCHAR(32)
        `).catch(() => { /* ignore on first creation */ })

        console.log("✅ OID4VCI pending offers table created or already exists.")
    } catch (error: any) {
        console.log(error)
        console.error("❌ Error creating OID4VCI pending offers table:", error.message)
    } finally {
        client.release()
    }
}

/**
 * Create OID4VP verification sessions table
 */
export async function oid4vpVerificationSessionsTable() {
    const client = await db.connect()
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS oid4vp_verification_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                verifier_id TEXT NOT NULL,
                presentation_definition JSONB NOT NULL,
                nonce TEXT NOT NULL,
                state TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                vp_token TEXT,
                verified_claims JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                completed_at TIMESTAMP
            )
        `)

        // Create indexes for efficient queries
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_oid4vp_sessions_tenant
            ON oid4vp_verification_sessions(tenant_id)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_oid4vp_sessions_state
            ON oid4vp_verification_sessions(state)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_oid4vp_sessions_status
            ON oid4vp_verification_sessions(status)
        `)

        console.log("✅ OID4VP verification sessions table created or already exists.")
    } catch (error: any) {
        console.log(error)
        console.error("❌ Error creating OID4VP verification sessions table:", error.message)
    } finally {
        client.release()
    }
}

/**
 * Create credential definitions table (for tracking format type)
 * This supplements the Credo-managed credential definitions
 */
export async function credentialDefinitionsTable() {
    const client = await db.connect()
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS credential_definitions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                credential_definition_id TEXT NOT NULL,
                schema_id TEXT NOT NULL,
                tag VARCHAR(255) NOT NULL,
                format VARCHAR(32) DEFAULT 'anoncreds',
                overlay JSONB,
                schema_attributes JSONB,
                doctype VARCHAR(255),
                namespaces JSONB,
                vc_contexts JSONB,
                vc_types JSONB,
                achievement JSONB,
                proof_suite VARCHAR(64),
                signing_alg VARCHAR(32),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `)

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_cred_defs_tenant
            ON credential_definitions(tenant_id)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_cred_defs_format
            ON credential_definitions(format)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_cred_defs_cred_def_id
            ON credential_definitions(credential_definition_id)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_cred_defs_doctype
            ON credential_definitions(doctype)
        `)

        console.log("✅ Credential definitions table created or already exists.")
    } catch (error: any) {
        console.log(error)
        console.error("❌ Error creating credential definitions table:", error.message)
    } finally {
        client.release()
    }
}

/**
 * Add mdoc + W3C VC + OBv3 columns to existing credential_definitions table
 * Run this migration if the table already exists
 */
export async function migrateMdocColumns() {
    const client = await db.connect()
    try {
        await client.query(`
            ALTER TABLE credential_definitions
            ADD COLUMN IF NOT EXISTS doctype VARCHAR(255)
        `)
        await client.query(`
            ALTER TABLE credential_definitions
            ADD COLUMN IF NOT EXISTS namespaces JSONB
        `)
        // W3C VC / OBv3 columns
        await client.query(`
            ALTER TABLE credential_definitions
            ADD COLUMN IF NOT EXISTS vc_contexts JSONB
        `)
        await client.query(`
            ALTER TABLE credential_definitions
            ADD COLUMN IF NOT EXISTS vc_types JSONB
        `)
        await client.query(`
            ALTER TABLE credential_definitions
            ADD COLUMN IF NOT EXISTS achievement JSONB
        `)
        await client.query(`
            ALTER TABLE credential_definitions
            ADD COLUMN IF NOT EXISTS proof_suite VARCHAR(64)
        `)
        await client.query(`
            ALTER TABLE credential_definitions
            ADD COLUMN IF NOT EXISTS signing_alg VARCHAR(32)
        `)
        // Widen format column to accommodate longer enum values
        await client.query(`
            ALTER TABLE credential_definitions
            ALTER COLUMN format TYPE VARCHAR(32)
        `).catch(() => { /* ignore on first creation */ })

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_cred_defs_doctype
            ON credential_definitions(doctype)
        `)

        console.log("✅ credential_definitions schema migration completed.")
    } catch (error: any) {
        console.log(error)
        console.error("❌ Error migrating credential_definitions columns:", error.message)
    } finally {
        client.release()
    }
}

/**
 * Initialize all OID4VC tables
 */
export async function initializeOid4vcTables() {
    await oid4vciPendingOffersTable()
    await oid4vpVerificationSessionsTable()
    await credentialDefinitionsTable()
    await migrateMdocColumns() // Run migration for existing tables
    console.log("✅ OID4VC tables initialized.")
}

// ============================================
// Institutional Credential Issuance Types
// ============================================

export type InstitutionalAgentSchema = {
    id: string;
    name: string;
    wallet_id: string;
    wallet_key: string;
    did: string | null;
    is_default: boolean;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

export type CredentialProviderSchema = {
    id: string;
    provider_id: string;  // 'digilocker', 'aadhaar_offline', etc.
    name: string;
    type: 'oauth' | 'file_upload' | 'api';
    config: Record<string, unknown> | null;
    is_active: boolean;
    created_at: Date;
}

export type InstitutionalCredentialTypeSchema = {
    id: string;
    provider_id: string;
    agent_id: string;
    credential_type: string;  // 'aadhaar', 'pan', 'driving_license'
    schema_id: string | null;
    credential_definition_id: string | null;
    attribute_mapping: Record<string, unknown> | null;
    is_active: boolean;
    created_at: Date;
}

export type IssuanceSessionSchema = {
    id: string;
    out_of_band_id: string;
    csrf_token: string;
    provider_id: string;
    credential_type: string | null;
    status: 'pending' | 'verified' | 'issued' | 'failed';
    provider_data: Record<string, unknown> | null;
    connection_id: string | null;
    credential_exchange_id: string | null;
    created_at: Date;
    expires_at: Date | null;
    issued_at: Date | null;
}

/**
 * Create institutional agents table
 * Stores ESSI default agent and other institutional issuers
 */
export async function institutionalAgentsTable() {
    const client = await db.connect()
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS institutional_agents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) UNIQUE NOT NULL,
                wallet_id VARCHAR(255) NOT NULL,
                wallet_key VARCHAR(255) NOT NULL,
                did VARCHAR(255),
                is_default BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `)

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_institutional_agents_is_default
            ON institutional_agents(is_default)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_institutional_agents_is_active
            ON institutional_agents(is_active)
        `)

        console.log("✅ Institutional agents table created or already exists.")
    } catch (error: any) {
        console.log(error)
        console.error("❌ Error creating institutional agents table:", error.message)
    } finally {
        client.release()
    }
}

/**
 * Create credential providers table
 * Stores different credential providers (Digilocker, Aadhaar, etc.)
 */
export async function credentialProvidersTable() {
    const client = await db.connect()
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS credential_providers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                provider_id VARCHAR(100) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                type VARCHAR(50) NOT NULL,
                config JSONB,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `)

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_credential_providers_provider_id
            ON credential_providers(provider_id)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_credential_providers_is_active
            ON credential_providers(is_active)
        `)

        console.log("✅ Credential providers table created or already exists.")
    } catch (error: any) {
        console.log(error)
        console.error("❌ Error creating credential providers table:", error.message)
    } finally {
        client.release()
    }
}

/**
 * Create institutional credential types table
 * Maps credential providers to their schema/cred-def configurations
 */
export async function institutionalCredentialTypesTable() {
    const client = await db.connect()
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS institutional_credential_types (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                provider_id VARCHAR(100) NOT NULL,
                agent_id UUID NOT NULL REFERENCES institutional_agents(id) ON DELETE CASCADE,
                credential_type VARCHAR(100) NOT NULL,
                schema_id VARCHAR(255),
                credential_definition_id VARCHAR(255),
                attribute_mapping JSONB,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(provider_id, credential_type)
            )
        `)

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_inst_cred_types_provider_id
            ON institutional_credential_types(provider_id)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_inst_cred_types_agent_id
            ON institutional_credential_types(agent_id)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_inst_cred_types_cred_type
            ON institutional_credential_types(credential_type)
        `)

        console.log("✅ Institutional credential types table created or already exists.")
    } catch (error: any) {
        console.log(error)
        console.error("❌ Error creating institutional credential types table:", error.message)
    } finally {
        client.release()
    }
}

/**
 * Create issuance sessions table
 * Tracks pending credential issuances with oobId and csrf tokens
 */
export async function issuanceSessionsTable() {
    const client = await db.connect()
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS issuance_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                out_of_band_id VARCHAR(255) NOT NULL,
                csrf_token VARCHAR(255) NOT NULL,
                provider_id VARCHAR(100) NOT NULL,
                credential_type VARCHAR(100),
                status VARCHAR(50) DEFAULT 'pending',
                provider_data JSONB,
                connection_id VARCHAR(255),
                credential_exchange_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                issued_at TIMESTAMP
            )
        `)

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_issuance_sessions_oob_id
            ON issuance_sessions(out_of_band_id)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_issuance_sessions_csrf_token
            ON issuance_sessions(csrf_token)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_issuance_sessions_provider_id
            ON issuance_sessions(provider_id)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_issuance_sessions_status
            ON issuance_sessions(status)
        `)

        console.log("✅ Issuance sessions table created or already exists.")
    } catch (error: any) {
        console.log(error)
        console.error("❌ Error creating issuance sessions table:", error.message)
    } finally {
        client.release()
    }
}

/**
 * Initialize all institutional credential issuance tables
 */
export async function initializeInstitutionalTables() {
    await institutionalAgentsTable()
    await credentialProvidersTable()
    await institutionalCredentialTypesTable()
    await issuanceSessionsTable()
    console.log("✅ Institutional credential issuance tables initialized.")
}

// import { dbConnection } from "./driver"
import { db } from "./driver";

export type UserSchema = {
    id:string;
    email:string;
    password:string;
    tenant_id:string;
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
    status: 'pending' | 'token_issued' | 'credential_issued' | 'expired';
    format: 'vc+sd-jwt' | 'mso_mdoc' | null;  // credential format
    doctype: string | null;  // for mdoc: e.g., 'org.iso.18013.5.1.mDL'
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
    format: 'anoncreds' | 'oid4vc' | 'mso_mdoc';
    overlay: Record<string, unknown> | null;
    schema_attributes: string[] | null;
    // mdoc-specific fields
    doctype: string | null;  // e.g., 'org.iso.18013.5.1.mDL'
    namespaces: Record<string, Record<string, unknown>> | null;  // mdoc namespace definitions
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
                format VARCHAR(20),
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
            ADD COLUMN IF NOT EXISTS format VARCHAR(20)
        `)
        await client.query(`
            ALTER TABLE oid4vci_pending_offers
            ADD COLUMN IF NOT EXISTS doctype VARCHAR(255)
        `)

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
                format VARCHAR(20) DEFAULT 'anoncreds',
                overlay JSONB,
                schema_attributes JSONB,
                doctype VARCHAR(255),
                namespaces JSONB,
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
 * Add mdoc columns to existing credential_definitions table
 * Run this migration if the table already exists
 */
export async function migrateMdocColumns() {
    const client = await db.connect()
    try {
        // Add doctype column if it doesn't exist
        await client.query(`
            ALTER TABLE credential_definitions
            ADD COLUMN IF NOT EXISTS doctype VARCHAR(255)
        `)

        // Add namespaces column if it doesn't exist
        await client.query(`
            ALTER TABLE credential_definitions
            ADD COLUMN IF NOT EXISTS namespaces JSONB
        `)

        // Create index for doctype
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_cred_defs_doctype
            ON credential_definitions(doctype)
        `)

        console.log("✅ mdoc columns migration completed.")
    } catch (error: any) {
        console.log(error)
        console.error("❌ Error migrating mdoc columns:", error.message)
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

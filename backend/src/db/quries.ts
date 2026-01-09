
import {db} from './driver'
import { UserSchema, CardTemplateSchema, CardAssetSchema } from "./schema"

export async function createUser({
    email,
    password,
    tenant_id
}: {
    email: string
    password?: string
    tenant_id: string
}) {
    // const db = await dbConnection()

    const client = await db.connect()
    try {
        await client.query(
            `
      INSERT INTO users_credo (email, password, tenant_id)
      VALUES ($1, $2, $3)
      RETURNING id, email, tenant_id, created_at
    `,
            [email, password ?? null, tenant_id]
        )
        console.log("✅ User created successfully.")
    } catch (error: any) {
        console.error("❌ Error creating user:", error.message)
        throw new Error(error.message)
    }finally{
        client.release()
    }
}


export async function getUserByEmail({
    email
}: {
    email: string
}) {
    // const db = await dbConnection()
    console.log('getUserByEmail is called')

    type GetUser = Omit<UserSchema,'password'>


    const client = await db.connect()

    try {
        const result = await client.query(
            `SELECT id, email, password, tenant_id, created_at FROM users_credo WHERE email = $1`,
            [email]
        )

        if (result.rows.length===0) {
            return null
        }

        console.log('USER INFORMATION',result.rows[0])
        
        return result.rows[0] // or map it if you want a custom structure
    } catch (error: any) {
        console.error("❌ Error fetching user:", error.message)
        throw new Error(error.message)
    }finally{
        client.release()
    }
}

// ============================================
// Card Template CRUD Operations
// ============================================

export async function createCardTemplate({
    tenant_id,
    name,
    description,
    category,
    craft_state,
    oca_branding,
    oca_meta,
    card_width = 340,
    card_height = 215,
    thumbnail
}: {
    tenant_id: string
    name: string
    description?: string
    category?: string
    craft_state: Record<string, unknown>
    oca_branding?: Record<string, unknown>
    oca_meta?: Record<string, unknown>
    card_width?: number
    card_height?: number
    thumbnail?: string
}): Promise<CardTemplateSchema> {
    const client = await db.connect()
    try {
        const result = await client.query(
            `INSERT INTO credential_card_templates
             (tenant_id, name, description, category, craft_state, oca_branding, oca_meta, card_width, card_height, thumbnail)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [
                tenant_id,
                name,
                description ?? null,
                category ?? null,
                JSON.stringify(craft_state),
                oca_branding ? JSON.stringify(oca_branding) : null,
                oca_meta ? JSON.stringify(oca_meta) : null,
                card_width,
                card_height,
                thumbnail ?? null
            ]
        )
        console.log("✅ Card template created successfully.")
        return result.rows[0]
    } catch (error: any) {
        console.error("❌ Error creating card template:", error.message)
        throw new Error(error.message)
    } finally {
        client.release()
    }
}

export async function getCardTemplates(tenant_id: string): Promise<CardTemplateSchema[]> {
    const client = await db.connect()
    try {
        const result = await client.query(
            `SELECT * FROM credential_card_templates
             WHERE tenant_id = $1
             ORDER BY updated_at DESC`,
            [tenant_id]
        )
        return result.rows
    } catch (error: any) {
        console.error("❌ Error fetching card templates:", error.message)
        throw new Error(error.message)
    } finally {
        client.release()
    }
}

export async function getCardTemplateById(id: string, tenant_id: string): Promise<CardTemplateSchema | null> {
    const client = await db.connect()
    try {
        const result = await client.query(
            `SELECT * FROM credential_card_templates
             WHERE id = $1 AND tenant_id = $2`,
            [id, tenant_id]
        )
        return result.rows[0] || null
    } catch (error: any) {
        console.error("❌ Error fetching card template:", error.message)
        throw new Error(error.message)
    } finally {
        client.release()
    }
}

export async function updateCardTemplate(
    id: string,
    tenant_id: string,
    updates: {
        name?: string
        description?: string
        category?: string
        craft_state?: Record<string, unknown>
        oca_branding?: Record<string, unknown>
        oca_meta?: Record<string, unknown>
        card_width?: number
        card_height?: number
        thumbnail?: string
    }
): Promise<CardTemplateSchema | null> {
    const client = await db.connect()
    try {
        // Build dynamic update query
        const fields: string[] = []
        const values: any[] = []
        let paramIndex = 1

        if (updates.name !== undefined) {
            fields.push(`name = $${paramIndex++}`)
            values.push(updates.name)
        }
        if (updates.description !== undefined) {
            fields.push(`description = $${paramIndex++}`)
            values.push(updates.description)
        }
        if (updates.category !== undefined) {
            fields.push(`category = $${paramIndex++}`)
            values.push(updates.category)
        }
        if (updates.craft_state !== undefined) {
            fields.push(`craft_state = $${paramIndex++}`)
            values.push(JSON.stringify(updates.craft_state))
        }
        if (updates.oca_branding !== undefined) {
            fields.push(`oca_branding = $${paramIndex++}`)
            values.push(JSON.stringify(updates.oca_branding))
        }
        if (updates.oca_meta !== undefined) {
            fields.push(`oca_meta = $${paramIndex++}`)
            values.push(JSON.stringify(updates.oca_meta))
        }
        if (updates.card_width !== undefined) {
            fields.push(`card_width = $${paramIndex++}`)
            values.push(updates.card_width)
        }
        if (updates.card_height !== undefined) {
            fields.push(`card_height = $${paramIndex++}`)
            values.push(updates.card_height)
        }
        if (updates.thumbnail !== undefined) {
            fields.push(`thumbnail = $${paramIndex++}`)
            values.push(updates.thumbnail)
        }

        if (fields.length === 0) {
            return getCardTemplateById(id, tenant_id)
        }

        fields.push(`updated_at = CURRENT_TIMESTAMP`)
        values.push(id, tenant_id)

        const result = await client.query(
            `UPDATE credential_card_templates
             SET ${fields.join(', ')}
             WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
             RETURNING *`,
            values
        )

        console.log("✅ Card template updated successfully.")
        return result.rows[0] || null
    } catch (error: any) {
        console.error("❌ Error updating card template:", error.message)
        throw new Error(error.message)
    } finally {
        client.release()
    }
}

export async function deleteCardTemplate(id: string, tenant_id: string): Promise<boolean> {
    const client = await db.connect()
    try {
        const result = await client.query(
            `DELETE FROM credential_card_templates
             WHERE id = $1 AND tenant_id = $2
             RETURNING id`,
            [id, tenant_id]
        )
        console.log("✅ Card template deleted successfully.")
        return result.rowCount !== null && result.rowCount > 0
    } catch (error: any) {
        console.error("❌ Error deleting card template:", error.message)
        throw new Error(error.message)
    } finally {
        client.release()
    }
}

export async function duplicateCardTemplate(id: string, tenant_id: string, newName: string): Promise<CardTemplateSchema | null> {
    const client = await db.connect()
    try {
        const result = await client.query(
            `INSERT INTO credential_card_templates
             (tenant_id, name, description, category, craft_state, oca_branding, oca_meta, card_width, card_height, thumbnail)
             SELECT tenant_id, $3, description, category, craft_state, oca_branding, oca_meta, card_width, card_height, thumbnail
             FROM credential_card_templates
             WHERE id = $1 AND tenant_id = $2
             RETURNING *`,
            [id, tenant_id, newName]
        )
        console.log("✅ Card template duplicated successfully.")
        return result.rows[0] || null
    } catch (error: any) {
        console.error("❌ Error duplicating card template:", error.message)
        throw new Error(error.message)
    } finally {
        client.release()
    }
}

// ============================================
// Card Asset CRUD Operations
// ============================================

export async function createCardAsset({
    tenant_id,
    template_id,
    asset_type,
    file_name,
    mime_type,
    content,
    width,
    height
}: {
    tenant_id: string
    template_id?: string
    asset_type: string
    file_name: string
    mime_type: string
    content: string
    width?: number
    height?: number
}): Promise<CardAssetSchema> {
    const client = await db.connect()
    try {
        const result = await client.query(
            `INSERT INTO credential_card_assets
             (tenant_id, template_id, asset_type, file_name, mime_type, content, width, height)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [tenant_id, template_id ?? null, asset_type, file_name, mime_type, content, width ?? null, height ?? null]
        )
        console.log("✅ Card asset created successfully.")
        return result.rows[0]
    } catch (error: any) {
        console.error("❌ Error creating card asset:", error.message)
        throw new Error(error.message)
    } finally {
        client.release()
    }
}

export async function getCardAssets(tenant_id: string, template_id?: string): Promise<CardAssetSchema[]> {
    const client = await db.connect()
    try {
        let query = `SELECT * FROM credential_card_assets WHERE tenant_id = $1`
        const params: any[] = [tenant_id]

        if (template_id) {
            query += ` AND (template_id = $2 OR template_id IS NULL)`
            params.push(template_id)
        }

        query += ` ORDER BY created_at DESC`

        const result = await client.query(query, params)
        return result.rows
    } catch (error: any) {
        console.error("❌ Error fetching card assets:", error.message)
        throw new Error(error.message)
    } finally {
        client.release()
    }
}

export async function getCardAssetById(id: string, tenant_id: string): Promise<CardAssetSchema | null> {
    const client = await db.connect()
    try {
        const result = await client.query(
            `SELECT * FROM credential_card_assets
             WHERE id = $1 AND tenant_id = $2`,
            [id, tenant_id]
        )
        return result.rows[0] || null
    } catch (error: any) {
        console.error("❌ Error fetching card asset:", error.message)
        throw new Error(error.message)
    } finally {
        client.release()
    }
}

export async function deleteCardAsset(id: string, tenant_id: string): Promise<boolean> {
    const client = await db.connect()
    try {
        const result = await client.query(
            `DELETE FROM credential_card_assets
             WHERE id = $1 AND tenant_id = $2
             RETURNING id`,
            [id, tenant_id]
        )
        console.log("✅ Card asset deleted successfully.")
        return result.rowCount !== null && result.rowCount > 0
    } catch (error: any) {
        console.error("❌ Error deleting card asset:", error.message)
        throw new Error(error.message)
    } finally {
        client.release()
    }
}

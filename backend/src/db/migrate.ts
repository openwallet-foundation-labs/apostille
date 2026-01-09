import { db } from './driver'
import { userTable } from './schema' // adjust the path if needed

async function migrate() {
  try {
    await userTable()
    console.log('✅ Database migration complete.')
    await db.end()
  } catch (err: any) {
    console.error('❌ Migration failed:', err.message)
    process.exit(1)
  }
}
migrate()

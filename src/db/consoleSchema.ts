import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const consoleMessages = sqliteTable('console_messages', {
  id: text('id').primaryKey(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  level: text('level').notNull(),
  text: text('text').notNull(),
  url: text('url'),
  created: integer('created', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const consoleClearMarkers = sqliteTable('console_clear_markers', {
  id: text('id').primaryKey(),
  profileName: text('profile_name').notNull(),
  clearedAt: integer('cleared_at', { mode: 'timestamp' }).notNull(),
})

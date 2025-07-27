export const migrations = [
  {
    tag: '0001_console_messages',
    sql: `CREATE TABLE \`console_messages\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`timestamp\` integer NOT NULL,
	\`level\` text NOT NULL,
	\`text\` text NOT NULL,
	\`url\` text,
	\`created\` integer DEFAULT (unixepoch()) NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX \`idx_console_messages_timestamp\` ON \`console_messages\` (\`timestamp\`);
CREATE INDEX \`idx_console_messages_level\` ON \`console_messages\` (\`level\`);
CREATE INDEX \`idx_console_messages_created\` ON \`console_messages\` (\`created\`);`,
  },
]

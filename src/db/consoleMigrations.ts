export const consoleMigrations = {
  journal: {
    version: '6',
    dialect: 'sqlite',
    entries: [
      {
        idx: 0,
        version: '6',
        when: Date.now(),
        tag: '0001_console_messages',
        breakpoints: true,
      },
    ],
  },
  migrations: {
    '0001_console_messages': `CREATE TABLE \`console_messages\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`timestamp\` integer NOT NULL,
\t\`level\` text NOT NULL,
\t\`text\` text NOT NULL,
\t\`url\` text,
\t\`created\` integer DEFAULT (unixepoch()) NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX \`idx_console_messages_timestamp\` ON \`console_messages\` (\`timestamp\`);
CREATE INDEX \`idx_console_messages_level\` ON \`console_messages\` (\`level\`);
CREATE INDEX \`idx_console_messages_created\` ON \`console_messages\` (\`created\`);`,
  },
}

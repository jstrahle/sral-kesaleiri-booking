function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Ymparistomuuttuja ${name} puuttuu`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  databaseUrl: required('DATABASE_URL'),
  sessionSecret: required('SESSION_SECRET'),
  sync: {
    url: required('PUBLIC_SYNC_URL'),
    secret: required('SYNC_SHARED_SECRET'),
  },
  bootstrap: {
    username: process.env.BOOTSTRAP_ADMIN_USERNAME,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  },
} as const;

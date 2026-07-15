function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Ymparistomuuttuja ${name} puuttuu`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  databaseUrl: required('DATABASE_URL'),
  syncSecret: required('SYNC_SHARED_SECRET'),
} as const;

import type { UserRole } from './users.ts';

declare module 'fastify' {
  interface Session {
    user?: {
      id: string;
      username: string;
      displayName: string;
      role: UserRole;
    };
  }
}

export {};

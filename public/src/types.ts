declare module 'fastify' {
  interface FastifyRequest {
    /** Allekirjoituksen tarkistus vaatii rungon tasmalleen sellaisena kuin se saapui. */
    rawBody?: string;
  }
}

export {};

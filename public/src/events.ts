import type { FastifyReply } from 'fastify';

/**
 * SSE-lahetys selaimille. Suunta on palvelin -> selain, kuten koko jarjestelmassa:
 * selain ei kysele, vaan saa paivitykset tyonnettyna.
 */

const clients = new Set<FastifyReply>();

export function addClient(reply: FastifyReply): void {
  clients.add(reply);
}

export function removeClient(reply: FastifyReply): void {
  clients.delete(reply);
}

export function clientCount(): number {
  return clients.size;
}

export function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of clients) {
    try {
      client.raw.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

/** Pitaa yhteydet auki valiproxyjen lapi. */
export function startHeartbeat(): NodeJS.Timeout {
  const timer = setInterval(() => {
    for (const client of clients) {
      try {
        client.raw.write(': ping\n\n');
      } catch {
        clients.delete(client);
      }
    }
  }, 25_000);

  timer.unref();
  return timer;
}

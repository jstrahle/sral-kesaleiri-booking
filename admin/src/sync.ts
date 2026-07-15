import { config } from './config.ts';
import { pool } from './db.ts';
import { sign } from './hmac.ts';

/**
 * Outbox-tyontaja. Ainoa tie hallintapuolelta julkiselle palvelulle.
 *
 * Julkinen palvelu ei koskaan avaa yhteytta tanne. Se kertoo edistymisensa
 * synkronointipyynnon VASTAUKSESSA (last_seq), joten tama tietaa mita pitaa
 * lahettaa uudelleen ilman etta se kysyy mitaan.
 *
 * Toimitus on vahintaan kerran (at-least-once): sama tapahtuma voi saapua
 * kahdesti. Julkinen puoli sietaa sen versionumeroiden avulla.
 */

const BATCH_SIZE = 200;
const POLL_INTERVAL_MS = 1_000;
const REQUEST_TIMEOUT_MS = 10_000;

interface OutboxRow {
  seq: string;
  event_id: string;
  type: string;
  payload: unknown;
}

interface Logger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

async function fetchBatch(): Promise<OutboxRow[]> {
  const result = await pool.query<OutboxRow>(
    `SELECT seq::text, event_id, type, payload
     FROM outbox
     WHERE delivered_at IS NULL
     ORDER BY seq
     LIMIT $1`,
    [BATCH_SIZE],
  );
  return result.rows;
}

async function markDelivered(seqs: string[]): Promise<void> {
  await pool.query(
    `UPDATE outbox SET delivered_at = now(), last_error = NULL
     WHERE seq = ANY($1::bigint[])`,
    [seqs],
  );
}

async function markFailed(seqs: string[], message: string): Promise<void> {
  await pool.query(
    `UPDATE outbox SET attempts = attempts + 1, last_error = $2
     WHERE seq = ANY($1::bigint[])`,
    [seqs, message.slice(0, 500)],
  );
}

/** Lahettaa yhden eran. Palauttaa true, jos era meni perille. */
async function pushBatch(rows: OutboxRow[], log: Logger): Promise<boolean> {
  const body = JSON.stringify({
    events: rows.map((row) => ({
      seq: row.seq,
      event_id: row.event_id,
      type: row.type,
      payload: row.payload,
    })),
  });

  const timestamp = String(Math.floor(Date.now() / 1000));
  const seqs = rows.map((row) => row.seq);

  try {
    const response = await fetch(config.sync.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Timestamp': timestamp,
        'X-Sync-Signature': sign(config.sync.secret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      await markFailed(seqs, `HTTP ${response.status}: ${text}`);
      log.warn({ status: response.status, count: rows.length }, 'synkronointi epaonnistui');
      return false;
    }

    await markDelivered(seqs);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markFailed(seqs, message);
    log.warn({ error: message, count: rows.length }, 'synkronointi ei tavoittanut julkista palvelua');
    return false;
  }
}

let running = false;

/** Yksi kierros: lahettaa kaikki toimittamattomat tapahtumat erina. */
export async function pushPending(log: Logger): Promise<void> {
  if (running) return;
  running = true;

  try {
    for (;;) {
      const rows = await fetchBatch();
      if (rows.length === 0) return;

      const delivered = await pushBatch(rows, log);
      // Epaonnistuneet rivit jaavat outboxiin ja yritetaan uudelleen.
      if (!delivered) return;
    }
  } catch (error) {
    log.error(error, 'outbox-tyontaja kaatui');
  } finally {
    running = false;
  }
}

export function startSyncPusher(log: Logger): NodeJS.Timeout {
  const timer = setInterval(() => {
    void pushPending(log);
  }, POLL_INTERVAL_MS);

  timer.unref();
  return timer;
}

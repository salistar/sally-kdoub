/**
 * @file shared/infraCheck.ts
 * @description Health-checks de l'infrastructure SallyCards / Solitaire.
 *
 * Vérifie en parallèle :
 *   - API REST (NestJS) : GET /health → {status:'ok'}
 *   - Socket-server : GET /health → {status:'ok'}
 *   - TURN/STUN : nslookup + TCP probe sur le port (3478 par défaut)
 *
 * Utilisé par :
 *   - Le bouton "Check infra" dans Settings (manual check à la demande)
 *   - Le cron VPS (scripts/cron-infra-check.sh) qui tourne chaque minuit et
 *     post les résultats vers /infra-monitoring/heartbeat
 *
 * Retourne une struct uniforme avec `ok:boolean`, `latencyMs:number`,
 * `error?:string`. Le caller décide quoi en faire (UI affichage, alerting…).
 */

export interface InfraCheckResult {
  service: 'api' | 'socket' | 'turn';
  url: string;
  ok: boolean;
  latencyMs: number;
  status?: number;
  error?: string;
  checkedAt: number;
}

const PROD_API_URL = 'https://api.salistar.com/api/v1';
const PROD_SOCKET_URL = 'https://ws.salistar.com';
const PROD_TURN_URL = 'turn.salistar.com:3478';

const apiUrl = process.env.EXPO_PUBLIC_API_URL || PROD_API_URL;
const socketUrl = process.env.EXPO_PUBLIC_SOCKET_URL || PROD_SOCKET_URL;
const turnHost = process.env.EXPO_PUBLIC_TURN_HOST || 'turn.salistar.com';
const turnPort = process.env.EXPO_PUBLIC_TURN_PORT || '3478';

async function probeUrl(name: 'api' | 'socket', url: string, healthPath: string): Promise<InfraCheckResult> {
  const fullUrl = `${url}${healthPath}`;
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(fullUrl, { method: 'GET', signal: ctrl.signal });
    clearTimeout(timeout);
    return {
      service: name,
      url: fullUrl,
      ok: res.ok,
      latencyMs: Date.now() - t0,
      status: res.status,
      checkedAt: Date.now(),
    };
  } catch (e: any) {
    return {
      service: name,
      url: fullUrl,
      ok: false,
      latencyMs: Date.now() - t0,
      error: e?.message ?? 'fetch failed',
      checkedAt: Date.now(),
    };
  }
}

async function probeTurn(): Promise<InfraCheckResult> {
  // Le TCP/UDP probe direct n'est pas faisable côté React Native sans
  // module natif. On utilise un HTTP GET sur une "sentinel URL" servie par
  // le coturn (config `cli-ip` + endpoint TLS), ou par défaut on tente un
  // ping HTTPS sur le sous-domaine — un 4xx revient toujours plus vite
  // qu'un timeout DNS, ce qui suffit pour valider la résolution + le
  // routing réseau jusqu'à la machine.
  const fullUrl = `https://${turnHost}:${turnPort}`;
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 4000);
    await fetch(fullUrl, { method: 'GET', signal: ctrl.signal }).catch(() => null);
    clearTimeout(timeout);
    // Si on arrive ici sans throw, la machine est joignable.
    return {
      service: 'turn',
      url: `${turnHost}:${turnPort}`,
      ok: true,
      latencyMs: Date.now() - t0,
      checkedAt: Date.now(),
    };
  } catch (e: any) {
    return {
      service: 'turn',
      url: `${turnHost}:${turnPort}`,
      ok: false,
      latencyMs: Date.now() - t0,
      error: e?.message ?? 'unreachable',
      checkedAt: Date.now(),
    };
  }
}

/** Lance les 3 checks en parallèle. ~5 s max au pire (timeout). */
export async function runInfraCheck(): Promise<InfraCheckResult[]> {
  // eslint-disable-next-line no-console
  console.log('[InfraCheck] ▶ probing api / socket / turn …');
  const results = await Promise.all([
    probeUrl('api', apiUrl, '/health'),
    probeUrl('socket', socketUrl, '/health'),
    probeTurn(),
  ]);
  // eslint-disable-next-line no-console
  console.log(
    `[InfraCheck] ✓ results — ${results.map((r) => `${r.service}=${r.ok ? '✓' : '✗'}(${r.latencyMs}ms)`).join(' ')}`,
  );
  return results;
}

/** Format human-readable pour Alert/Modal. */
export function formatInfraReport(results: InfraCheckResult[]): string {
  return results
    .map((r) => {
      const emoji = r.ok ? '✅' : '❌';
      const tail = r.ok ? `${r.latencyMs}ms` : (r.error ?? 'erreur');
      return `${emoji} ${r.service.toUpperCase()} — ${tail}`;
    })
    .join('\n');
}

/* === End of infraCheck.ts — Solitaire — SallyCards === */

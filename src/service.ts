import type { Instant } from "./storage";

const genericErrorMessage = "Erro desconhecido, tente novamente mais tarde";

/**
 * Every backend reply is an envelope. Success carries `data`; most
 * application errors come back as HTTP 200 with `{ label, message }` and no
 * `data` at all — fetch does not reject on that (or on any other HTTP
 * status), so an absent `data`, same as a non-ok status, is judged after the
 * fact rather than caught.
 */
interface Envelope<T> {
  data?: T;
  label?: string;
  message?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly label: string | null,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface Listing {
  instants?: Instant[];
  pages?: number;
}

/** `exists: false` means myinstants.com no longer has the clip, and the
 *  backend sends no content at all — so the union, not an optional field:
 *  checking `exists` is what makes `content` available. */
export type ContentInfo = { exists: true; content: string } | { exists: false };

interface PlayResult {
  exitReason: string;
}

/** `omitempty` on the backend: the four optional fields are simply absent
 *  from the JSON when they don't apply, never sent as empty strings. Ids
 *  are strings — Discord snowflakes overflow a JS number. */
export interface BotStatus {
  connected: boolean;
  guildId?: string;
  guildName?: string;
  channelId?: string;
  channelName?: string;
}

type Listener<T extends unknown[]> = (...args: T) => void;

// No default: only an explicit user pick or a discovered server ever sets
// this. Absent both, the app talks to nothing rather than quietly assuming
// a backend on localhost.
let apiUrl: string | null = null;

let healthy = false;
const healthListeners = new Set<Listener<[boolean]>>();
const connectionErrorListeners = new Set<Listener<[]>>();

function markHealth(next: boolean): void {
  if (healthy === next) {
    return;
  }

  healthy = next;
  healthListeners.forEach((listener) => listener(healthy));
}

// fetch rejects only when no response ever arrives — a network failure, not
// an HTTP error status. That is exactly the "request failed" signal that
// makes the server unhealthy; an error body, or any other status, still
// means the server answered.
function markConnectionFailure(): void {
  markHealth(false);
  connectionErrorListeners.forEach((listener) => listener());
}

export function isHealthy(): boolean {
  return healthy;
}

export function onHealthChange(listener: Listener<[boolean]>): () => void {
  if (typeof listener !== "function") {
    return () => {};
  }

  healthListeners.add(listener);

  return () => {
    healthListeners.delete(listener);
  };
}

export function onConnectionError(listener: Listener<[]>): () => void {
  if (typeof listener !== "function") {
    return () => {};
  }

  connectionErrorListeners.add(listener);

  return () => {
    connectionErrorListeners.delete(listener);
  };
}

export function normalizeApiUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  if (!parsed.hostname || parsed.search || parsed.hash) {
    return null;
  }

  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
}

export function getApiUrl(): string | null {
  return apiUrl;
}

/** Adopts `value` only if it is an http(s) URL with a host, so a malformed
 *  address is ignored rather than displacing a working one. */
export function setApiUrl(value: unknown): boolean {
  const normalized = normalizeApiUrl(value);

  if (!normalized) {
    return false;
  }

  apiUrl = normalized;
  markHealth(true);
  return true;
}

/** Drops back to no server at all — not a default address — so a stale
 *  pick or an empty discovery list never quietly reactivates localhost. */
export function resetApiUrl(): void {
  apiUrl = null;
  markHealth(false);
}

/** Every request goes through this first: with no server at all, there is
 *  nothing to fetch, so that is folded into the same "connection failure"
 *  signal a real unreachable server produces, rather than attempting a
 *  request against a nonsensical URL. */
function requireApiUrl(): string {
  if (apiUrl === null) {
    markConnectionFailure();
    throw new ApiError(null, genericErrorMessage);
  }

  return apiUrl;
}

/** Issues `fetch(url, init)`, unwraps the envelope, and folds a non-ok status
 *  into the same ApiError path as a 200 with no `data` — the try/catch around
 *  the fetch itself covers only a genuine network failure, so neither case
 *  gets rewritten into the generic fallback. */
async function requestEnvelope<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch {
    markConnectionFailure();
    throw new ApiError(null, genericErrorMessage);
  }

  markHealth(true);

  let body: Envelope<T> = {};
  try {
    body = await response.json();
  } catch {
    // No body at all, or not JSON — treated as an empty envelope below.
  }

  if (!response.ok || !body.data) {
    throw new ApiError(body.label ?? null, body.message || genericErrorMessage);
  }

  return body.data;
}

export async function playOnDiscord(url: string): Promise<string> {
  const base = requireApiUrl();
  const result = await requestEnvelope<PlayResult>(`${base}/bot/play`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });

  return result.exitReason;
}

export async function stopPlayingOnDiscord(): Promise<Response> {
  const base = requireApiUrl();
  let response: Response;

  try {
    response = await fetch(`${base}/bot/stop`, { method: "POST" });
  } catch (err) {
    markConnectionFailure();
    throw err;
  }

  markHealth(true);

  if (!response.ok) {
    throw response;
  }

  return response;
}

export async function getContent(url: string): Promise<ContentInfo> {
  const base = requireApiUrl();
  return requestEnvelope<ContentInfo>(`${base}/instants/${encodeURIComponent(url)}/content`);
}

export async function getBotStatus(): Promise<BotStatus> {
  const base = requireApiUrl();
  return requestEnvelope<BotStatus>(`${base}/bot/status`);
}

export async function testServer(candidateBase: string): Promise<BotStatus> {
  let response: Response;

  try {
    response = await fetch(`${candidateBase}/bot/status`);
  } catch {
    throw new ApiError(null, genericErrorMessage);
  }

  let body: Envelope<BotStatus> = {};
  try {
    body = await response.json();
  } catch {}

  if (!response.ok || !body.data) {
    throw new ApiError(body.label ?? null, body.message || genericErrorMessage);
  }

  return body.data;
}

/** `region` is sent whenever it is given. Which requests it affects (today,
 *  only the listing with no search term) is the backend's call, so the client
 *  does not second-guess it. */
export async function getMyInstants(
  page?: number,
  search?: string,
  region?: string
): Promise<Listing> {
  const base = requireApiUrl();
  const params = [
    { value: page || 1, query: `page=${page}` },
    { value: search, query: `&search=${search}` },
    { value: region, query: `&region=${encodeURIComponent(region ?? "")}` }
  ].reduce((acc, cur) => (cur.value ? acc + cur.query : acc), "");

  return requestEnvelope<Listing>(`${base}/instants?${params}`);
}

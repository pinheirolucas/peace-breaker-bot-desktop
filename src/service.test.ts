import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { JsonBodyType } from "msw";

import {
  ApiError,
  playOnDiscord,
  stopPlayingOnDiscord,
  getContent,
  getInstants,
  getProviders,
  getBotStatus,
  getApiUrl,
  setApiUrl,
  resetApiUrl,
  isHealthy,
  onHealthChange,
  onConnectionError,
  normalizeApiUrl,
  testServer
} from "./service";

// Mocking at the request level rather than stubbing fetch keeps these tests
// honest about the two things that actually bite here: the exact query strings
// service.ts builds, and the response envelope the Go backend really sends.
const apiUrl = "http://localhost:9001/api/v1";

const server = setupServer();

// There is no default server: every describe block below other than the
// "no active server" ones needs an explicit address adopted first, exactly
// as App.tsx would from a pick or a discovery result.
beforeEach(() => {
  setApiUrl(apiUrl);
});

// Every response goes through the backend's `response` struct:
// {label, message, data}, with empty fields omitted.
function success(data: JsonBodyType) {
  return HttpResponse.json({ data });
}

function errorAt200(label: string, message: string) {
  return HttpResponse.json({ label, message });
}

// The one genuine non-200 the backend can produce is the http.Error fallback
// when encoding the body itself fails; a dead or misbehaving proxy in front of
// it would do the same. fetch itself does not reject on this — service.ts
// checks response.ok explicitly to treat it the same as a 200 error envelope.
function errorAtStatus(status: number, body: JsonBodyType) {
  return HttpResponse.json(body, { status });
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetApiUrl();
});
afterAll(() => server.close());

describe("playOnDiscord", () => {
  it("posts the url and returns the exit reason", async () => {
    let body;
    server.use(
      http.post(`${apiUrl}/bot/play`, async ({ request }) => {
        body = await request.json();
        return success({ exitReason: "end" });
      })
    );

    await expect(playOnDiscord("https://www.myinstants.com/a/")).resolves.toBe(
      "end"
    );
    expect(body).toEqual({ url: "https://www.myinstants.com/a/" });
  });

  it("surfaces the backend message when the response really is an error status", async () => {
    server.use(
      http.post(`${apiUrl}/bot/play`, () =>
        errorAtStatus(400, {
          label: "instant_not_found",
          message: "O instant enviado não foi encontrado"
        })
      )
    );

    await expect(playOnDiscord("https://www.myinstants.com/a/")).rejects.toThrow(
      "O instant enviado não foi encontrado"
    );
  });

  it("falls back to the generic message when the error body carries none", async () => {
    server.use(
      http.post(`${apiUrl}/bot/play`, () => errorAtStatus(500, { label: "boom" }))
    );

    await expect(playOnDiscord("https://www.myinstants.com/a/")).rejects.toThrow(
      "Erro desconhecido, tente novamente mais tarde"
    );
  });

  it("falls back to the generic message when there is no response at all", async () => {
    server.use(http.post(`${apiUrl}/bot/play`, () => HttpResponse.error()));

    await expect(playOnDiscord("https://www.myinstants.com/a/")).rejects.toThrow(
      "Erro desconhecido, tente novamente mais tarde"
    );
  });

  // The bot has no voice connection: same envelope shape as any other
  // application error, just at 409 instead of 200 or 400 — the generic
  // envelope handling covers it with no code of its own.
  it("throws ApiError(bot_not_connected) on a 409", async () => {
    server.use(
      http.post(`${apiUrl}/bot/play`, () =>
        errorAtStatus(409, {
          label: "bot_not_connected",
          message: "O bot ainda não está em um canal de voz"
        })
      )
    );

    await expect(playOnDiscord("https://www.myinstants.com/a/")).rejects.toMatchObject({
      label: "bot_not_connected",
      message: "O bot ainda não está em um canal de voz"
    });
  });

  // The backend sends its errors with HTTP 200, so fetch does not reject and the
  // envelope has to be judged on the success path — before `.exitReason` is read
  // off a `data` that is not there.
  it("surfaces the backend message when the error arrives with HTTP 200", async () => {
    server.use(
      http.post(`${apiUrl}/bot/play`, () =>
        errorAt200("instant_not_found", "O instant enviado não foi encontrado")
      )
    );

    await expect(playOnDiscord("https://www.myinstants.com/a/")).rejects.toThrow(
      "O instant enviado não foi encontrado"
    );
  });

  it("falls back to the generic message when a 200 error body carries none", async () => {
    server.use(
      http.post(`${apiUrl}/bot/play`, () => HttpResponse.json({ label: "nope" }))
    );

    await expect(playOnDiscord("https://www.myinstants.com/a/")).rejects.toThrow(
      "Erro desconhecido, tente novamente mais tarde"
    );
  });
});

describe("ApiError", () => {
  it("carries the backend's label alongside its message", async () => {
    server.use(
      http.post(`${apiUrl}/bot/play`, () =>
        errorAt200("instant_not_found", "O instant enviado não foi encontrado")
      )
    );

    await expect(playOnDiscord("x")).rejects.toBeInstanceOf(ApiError);
    await expect(playOnDiscord("x")).rejects.toMatchObject({
      label: "instant_not_found",
      message: "O instant enviado não foi encontrado"
    });
  });

  it("has a null label when the error body carries none", async () => {
    server.use(http.post(`${apiUrl}/bot/play`, () => errorAtStatus(500, {})));

    await expect(playOnDiscord("x")).rejects.toMatchObject({ label: null });
  });

  it("is still an ApiError, with a null label, when there is no response at all", async () => {
    server.use(http.post(`${apiUrl}/bot/play`, () => HttpResponse.error()));

    await expect(playOnDiscord("x")).rejects.toBeInstanceOf(ApiError);
    await expect(playOnDiscord("x")).rejects.toMatchObject({ label: null });
  });
});

describe("stopPlayingOnDiscord", () => {
  it("posts to /bot/stop and resolves with the raw fetch response", async () => {
    let seen = 0;
    let method;
    server.use(
      http.post(`${apiUrl}/bot/stop`, ({ request }) => {
        seen += 1;
        method = request.method;
        // handleBotStop writes nothing at all — no body, no content type.
        return new HttpResponse(null, { status: 200 });
      })
    );

    const response = await stopPlayingOnDiscord();

    expect(seen).toBe(1);
    expect(method).toBe("POST");
    expect(response.status).toBe(200);
  });

  // Unlike playOnDiscord this one has no catch, so a failure escapes as the raw
  // fetch Response (fetch itself only rejects on a network failure — a genuine
  // error status resolves, so it is thrown explicitly). useDiscordPlayer#stop
  // awaits it without a catch either, so a rejection here becomes an unhandled
  // rejection rather than a snackbar.
  it("rejects with the raw response, unwrapped, on a real error status", async () => {
    server.use(
      http.post(`${apiUrl}/bot/stop`, () => errorAtStatus(500, { label: "boom" }))
    );

    await expect(stopPlayingOnDiscord()).rejects.toMatchObject({ status: 500 });
  });
});

describe("getContent", () => {
  it("unwraps data.data into the playable info", async () => {
    server.use(
      http.get(`${apiUrl}/instants/:url/content`, () =>
        success({ exists: true, content: "data:audio/mp3;base64,AAAA" })
      )
    );

    await expect(getContent("https://www.myinstants.com/a/")).resolves.toEqual({
      exists: true,
      content: "data:audio/mp3;base64,AAAA"
    });
  });

  it("passes the instant url through as a percent-encoded path segment", async () => {
    let received;
    server.use(
      http.get(`${apiUrl}/instants/:url/content`, ({ params }) => {
        received = decodeURIComponent(params.url as string);
        return success({ exists: true, content: "" });
      })
    );

    await getContent("https://www.myinstants.com/en/instant-abc/");

    expect(received).toBe("https://www.myinstants.com/en/instant-abc/");
  });

  it("percent-encodes the url so it survives as a single path segment", async () => {
    let rawPath;
    let received;
    server.use(
      http.get(`${apiUrl}/instants/:url/content`, ({ request, params }) => {
        rawPath = new URL(request.url).pathname;
        received = decodeURIComponent(params.url as string);
        return success({ exists: false });
      })
    );

    await getContent("https://x/a?b=1&c=2");

    expect(rawPath).toBe(
      `/api/v1/instants/${encodeURIComponent("https://x/a?b=1&c=2")}/content`
    );
    expect(received).toBe("https://x/a?b=1&c=2");
  });

  it("surfaces the backend message when the error arrives with HTTP 200", async () => {
    server.use(
      http.get(`${apiUrl}/instants/:url/content`, () =>
        errorAt200("empty_url", "Nenhuma URL enviada")
      )
    );

    await expect(getContent("https://www.myinstants.com/a/")).rejects.toThrow(
      "Nenhuma URL enviada"
    );
  });

  // Was the raw axios error, whose message is "Request failed with status
  // code 500" — no use to a panel that puts it straight in a snackbar.
  it("rejects with a message-bearing error on a real error status", async () => {
    server.use(
      http.get(`${apiUrl}/instants/:url/content`, () =>
        errorAtStatus(500, { label: "unknown_error", message: "Falha ao baixar" })
      )
    );

    await expect(getContent("https://www.myinstants.com/a/")).rejects.toThrow(
      "Falha ao baixar"
    );
  });

  it("falls back to the generic message when the error body carries none", async () => {
    server.use(
      http.get(`${apiUrl}/instants/:url/content`, () =>
        errorAtStatus(500, { label: "unknown_error" })
      )
    );

    await expect(getContent("https://www.myinstants.com/a/")).rejects.toThrow(
      "Erro desconhecido, tente novamente mais tarde"
    );
  });
});

describe("getBotStatus", () => {
  it("unwraps data.data into the bot's connection status", async () => {
    server.use(
      http.get(`${apiUrl}/bot/status`, () =>
        success({
          connected: true,
          guildId: "123456789012345678",
          guildName: "Peace Breakers",
          channelId: "876543210987654321",
          channelName: "geral"
        })
      )
    );

    await expect(getBotStatus()).resolves.toEqual({
      connected: true,
      guildId: "123456789012345678",
      guildName: "Peace Breakers",
      channelId: "876543210987654321",
      channelName: "geral"
    });
  });

  it("resolves the optional fields as absent, not empty strings, when not connected", async () => {
    server.use(http.get(`${apiUrl}/bot/status`, () => success({ connected: false })));

    await expect(getBotStatus()).resolves.toEqual({ connected: false });
  });

  it("throws the backend message on a real error status", async () => {
    server.use(
      http.get(`${apiUrl}/bot/status`, () => errorAtStatus(500, { label: "boom" }))
    );

    await expect(getBotStatus()).rejects.toThrow(
      "Erro desconhecido, tente novamente mais tarde"
    );
  });
});

describe("getInstants", () => {
  const listing = {
    instants: [
      { name: "Primeiro", url: "https://www.myinstants.com/a/" },
      { name: "Segundo", url: "https://www.myinstants.com/b/" }
    ],
    pages: 3
  };

  function captureQuery(respond = () => success(listing)) {
    const captured: { search?: string } = {};
    server.use(
      http.get(`${apiUrl}/instants`, ({ request }) => {
        captured.search = new URL(request.url).search;
        return respond();
      })
    );
    return captured;
  }

  it("unwraps data.data into the instants and page count", async () => {
    captureQuery();

    await expect(getInstants(1)).resolves.toEqual(listing);
  });

  it("sends page and search together", async () => {
    const captured = captureQuery();

    await getInstants(2, "boo");

    expect(captured.search).toBe("?page=2&search=boo");
  });

  it("omits search entirely when it is empty", async () => {
    const captured = captureQuery();

    await getInstants(2, "");

    expect(captured.search).toBe("?page=2");
  });

  it("sends the region after page and search", async () => {
    const captured = captureQuery();

    await getInstants(2, "boo", "br");

    expect(captured.search).toBe("?page=2&search=boo&region=br");
  });

  // The backend applies the region only to the listing with no search term,
  // but that is its call: the client sends it either way.
  it("sends the region without a search too", async () => {
    const captured = captureQuery();

    await getInstants(1, "", "pt");

    expect(captured.search).toBe("?page=1&region=pt");
  });

  it("sends the provider after page, search and region", async () => {
    const captured = captureQuery();

    await getInstants(2, "boo", "br", "soundbuttons");

    expect(captured.search).toBe("?page=2&search=boo&region=br&provider=soundbuttons");
  });

  // Omitted entirely rather than sent empty, so a caller that never resolved
  // a provider (the app before the registry answers) gets the exact request
  // it always sent — the backend already defaults that to myinstants.
  it("omits the provider entirely when it is not given", async () => {
    const captured = captureQuery();

    await getInstants(1);

    expect(captured.search).toBe("?page=1");
  });

  // Pre-existing quirk, asserted as current behaviour rather than fixed. The
  // `page || 1` default is only used to decide *whether* to append the
  // parameter; the parameter itself is built from the raw `page`, so with no
  // argument the request literally reads ?page=undefined. The Go handler parses
  // that with strconv.Atoi, fails, and falls back to page 1, which is why
  // nobody has noticed. No caller in this app hits it — both panels always pass
  // a page — but it is one refactor away from mattering.
  it("sends page=undefined when called with no page", async () => {
    const captured = captureQuery();

    await getInstants();

    expect(captured.search).toBe("?page=undefined");
  });

  // Same missing encodeURIComponent as getContent, and here it is trivially
  // reachable: the search box in the AppBar feeds this directly. The URL layer
  // rescues a literal space (it normalises to %20), but it has no reason to
  // touch an ampersand, so "a b&c" is sent as a search of "a b" plus a stray
  // parameter "c". Asserted as current behaviour, not fixed.
  it("does not percent-encode the search term, so an ampersand splits it", async () => {
    const captured = captureQuery();

    await getInstants(1, "a b&c");

    expect(captured.search).toBe("?page=1&search=a%20b&c");
    const params = new URLSearchParams(captured.search);
    expect(params.get("search")).toBe("a b");
    expect(params.has("c")).toBe(true);
  });

  it("throws the backend message on a real error status", async () => {
    server.use(
      http.get(`${apiUrl}/instants`, () =>
        errorAtStatus(400, {
          label: "invalid_page",
          message: "A página enviada é inválida"
        })
      )
    );

    await expect(getInstants(1)).rejects.toThrow("A página enviada é inválida");
  });

  // Like every backend error, a refused region arrives as HTTP 200 with a
  // {label, message} body, so it goes through the envelope check.
  it("throws the backend message when the region is refused", async () => {
    server.use(
      http.get(`${apiUrl}/instants`, () =>
        errorAt200("invalid_region", "A região enviada é inválida")
      )
    );

    await expect(getInstants(1, "", "zz")).rejects.toThrow("A região enviada é inválida");
  });

  it("falls back to the generic message when the error body carries none", async () => {
    server.use(
      http.get(`${apiUrl}/instants`, () => errorAtStatus(500, {}))
    );

    await expect(getInstants(1)).rejects.toThrow(
      "Erro desconhecido, tente novamente mais tarde"
    );
  });

  // The backend reports most errors as HTTP 200 with {label, message} and no
  // data, so an absent `data` is an error, not an empty listing — the envelope
  // check runs after the catch so its throw reaches the caller untouched.
  it("throws the backend message when the error arrives with HTTP 200", async () => {
    server.use(
      http.get(`${apiUrl}/instants`, () =>
        errorAt200("invalid_page", "A página enviada é inválida")
      )
    );

    await expect(getInstants(1)).rejects.toThrow("A página enviada é inválida");
  });

  it("falls back to the generic message when a 200 error body carries none", async () => {
    server.use(
      http.get(`${apiUrl}/instants`, () => HttpResponse.json({ label: "nope" }))
    );

    await expect(getInstants(1)).rejects.toThrow(
      "Erro desconhecido, tente novamente mais tarde"
    );
  });

  it("still rejects when the body is empty altogether", async () => {
    server.use(http.get(`${apiUrl}/instants`, () => HttpResponse.json({})));

    await expect(getInstants(1)).rejects.toThrow(
      "Erro desconhecido, tente novamente mais tarde"
    );
  });

  it("keeps resolving a real listing", async () => {
    captureQuery();

    await expect(getInstants(1)).resolves.toEqual(listing);
  });
});

describe("getProviders", () => {
  const providers = [
    { key: "myinstants", name: "MyInstants", supportsSearch: true, supportsRegion: true },
    { key: "soundbuttons", name: "Sound Buttons", supportsSearch: true, supportsRegion: false }
  ];

  it("unwraps data.data into the provider list", async () => {
    server.use(http.get(`${apiUrl}/providers`, () => success(providers)));

    await expect(getProviders()).resolves.toEqual(providers);
  });

  it("throws the backend message on a real error status", async () => {
    server.use(http.get(`${apiUrl}/providers`, () => errorAtStatus(500, {})));

    await expect(getProviders()).rejects.toThrow("Erro desconhecido, tente novamente mais tarde");
  });
});

describe("api base url", () => {
  const discovered = "http://10.0.0.133:9001";

  // There is no default: only setApiUrl (an explicit pick or a discovered
  // server) ever gives the app something to talk to.
  describe("with no active server", () => {
    beforeEach(() => {
      resetApiUrl();
    });

    it("starts with no server at all", () => {
      expect(getApiUrl()).toBeNull();
    });

    it("refuses every request rather than falling back to localhost", async () => {
      expect(window.instantsDiscovery).toBeUndefined();

      let hit = false;
      server.use(
        http.get(`${apiUrl}/instants`, () => {
          hit = true;
          return success({ instants: [], pages: 0 });
        })
      );

      await expect(getInstants(1)).rejects.toThrow(
        "Erro desconhecido, tente novamente mais tarde"
      );

      expect(hit).toBe(false);
    });

    it("counts as a connection failure, so the offline UI still reacts", async () => {
      let errors = 0;
      const unsubscribe = onConnectionError(() => {
        errors += 1;
      });

      await expect(playOnDiscord("x")).rejects.toBeInstanceOf(ApiError);

      expect(isHealthy()).toBe(false);
      expect(errors).toBe(1);
      unsubscribe();
    });

    it("drops back to no server when explicitly reset", () => {
      setApiUrl(discovered);
      expect(getApiUrl()).toBe(discovered);

      resetApiUrl();

      expect(getApiUrl()).toBeNull();
      expect(isHealthy()).toBe(false);
    });
  });

  it("sends every subsequent request to an adopted address", async () => {
    expect(setApiUrl(discovered)).toBe(true);
    expect(getApiUrl()).toBe(discovered);

    const seen: string[] = [];
    server.use(
      http.post(`${discovered}/bot/play`, ({ request }) => {
        seen.push(new URL(request.url).origin);
        return success({ exitReason: "end" });
      }),
      http.post(`${discovered}/bot/stop`, ({ request }) => {
        seen.push(new URL(request.url).origin);
        return new HttpResponse(null, { status: 200 });
      }),
      http.get(`${discovered}/instants/:url/content`, ({ request }) => {
        seen.push(new URL(request.url).origin);
        return success({ exists: true, content: "" });
      }),
      http.get(`${discovered}/instants`, ({ request }) => {
        seen.push(new URL(request.url).origin);
        return success({ instants: [], pages: 0 });
      })
    );

    await playOnDiscord("https://www.myinstants.com/a/");
    await stopPlayingOnDiscord();
    await getContent("https://www.myinstants.com/a/");
    await getInstants(1);

    expect(seen).toEqual([discovered, discovered, discovered, discovered]);
  });

  it("strips a trailing slash so paths are not doubled", async () => {
    expect(setApiUrl("http://10.0.0.133:9001/")).toBe(true);
    expect(getApiUrl()).toBe(discovered);

    let path;
    server.use(
      http.post(`${discovered}/bot/stop`, ({ request }) => {
        path = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 200 });
      })
    );

    await stopPlayingOnDiscord();

    expect(path).toBe("/bot/stop");
  });

  it("keeps a base path announced by the service", async () => {
    expect(setApiUrl("http://10.0.0.133:9001/api/")).toBe(true);
    expect(getApiUrl()).toBe("http://10.0.0.133:9001/api");

    let path;
    server.use(
      http.post(`${discovered}/api/bot/stop`, ({ request }) => {
        path = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 200 });
      })
    );

    await stopPlayingOnDiscord();

    expect(path).toBe("/api/bot/stop");
  });

  it("accepts an ipv6 address in brackets and https", () => {
    expect(setApiUrl("http://[2001:db8::42]:9001")).toBe(true);
    expect(getApiUrl()).toBe("http://[2001:db8::42]:9001");

    expect(setApiUrl("https://instants.lan:9001")).toBe(true);
    expect(getApiUrl()).toBe("https://instants.lan:9001");
  });

  it.each([
    ["an empty string", ""],
    ["blank space", "   "],
    ["a bare host and port", "10.0.0.133:9001"],
    ["a schemeless host", "localhost:9001"],
    ["a word", "not a url"],
    ["an unusable scheme", "ftp://10.0.0.133:9001"],
    ["a file url", "file:///etc/passwd"],
    ["a scheme with no host", "http://"],
    ["a query string", "http://10.0.0.133:9001?x=1"],
    ["a fragment", "http://10.0.0.133:9001/#x"],
    ["null", null],
    ["undefined", undefined],
    ["a number", 9001],
    ["an object", {}]
  ])("ignores %s instead of adopting it", (_label, value) => {
    expect(setApiUrl(value)).toBe(false);
    expect(getApiUrl()).toBe(apiUrl);
  });

  it("does not lose a good address to a malformed one that arrives later", async () => {
    setApiUrl(discovered);

    expect(setApiUrl("nonsense")).toBe(false);
    expect(getApiUrl()).toBe(discovered);

    let hit = false;
    server.use(
      http.get(`${discovered}/instants`, () => {
        hit = true;
        return success({ instants: [], pages: 0 });
      })
    );

    await getInstants(1);

    expect(hit).toBe(true);
  });
});

describe("connection health", () => {
  it("starts healthy", () => {
    expect(isHealthy()).toBe(true);
  });

  it("goes unhealthy when the backend cannot be reached at all", async () => {
    server.use(http.get(`${apiUrl}/instants`, () => HttpResponse.error()));

    await expect(getInstants(1)).rejects.toThrow();
    expect(isHealthy()).toBe(false);
  });

  it("stays healthy when the backend answers with an error body at 200", async () => {
    server.use(
      http.get(`${apiUrl}/instants`, () =>
        errorAt200("bad_http_status", "O site myinstants.com respondeu com um status de erro")
      )
    );

    await expect(getInstants(1)).rejects.toThrow(
      "O site myinstants.com respondeu com um status de erro"
    );
    expect(isHealthy()).toBe(true);
  });

  it("stays healthy on a genuine non-200 — the server did answer", async () => {
    server.use(
      http.get(`${apiUrl}/instants`, () =>
        errorAtStatus(500, { message: "boom" })
      )
    );

    await expect(getInstants(1)).rejects.toThrow();
    expect(isHealthy()).toBe(true);
  });

  it("recovers once a request succeeds again", async () => {
    server.use(http.post(`${apiUrl}/bot/play`, () => HttpResponse.error()));
    await expect(playOnDiscord("x")).rejects.toThrow();
    expect(isHealthy()).toBe(false);

    server.resetHandlers();
    server.use(
      http.post(`${apiUrl}/bot/play`, () => success({ exitReason: "end" }))
    );
    await playOnDiscord("x");

    expect(isHealthy()).toBe(true);
  });

  it("notifies listeners on each transition, not on every request", async () => {
    const seen: boolean[] = [];
    const unsubscribe = onHealthChange(next => seen.push(next));

    server.use(http.post(`${apiUrl}/bot/stop`, () => HttpResponse.error()));
    await expect(stopPlayingOnDiscord()).rejects.toThrow();
    await expect(stopPlayingOnDiscord()).rejects.toThrow();

    server.resetHandlers();
    server.use(http.post(`${apiUrl}/bot/stop`, () => success({})));
    await stopPlayingOnDiscord();

    unsubscribe();
    expect(seen).toEqual([false, true]);
  });

  it("stops notifying after unsubscribe", async () => {
    const seen: boolean[] = [];
    onHealthChange(next => seen.push(next))();

    server.use(http.get(`${apiUrl}/instants/:url/content`, () => HttpResponse.error()));
    await expect(getContent("x")).rejects.toThrow();

    expect(seen).toEqual([]);
    expect(isHealthy()).toBe(false);
  });

  it("ignores a listener that is not a function", () => {
    // Deliberately wrong: the guard exists for untyped callers.
    expect(() => onHealthChange(null as never)()).not.toThrow();
  });

  it("assumes a newly selected server is healthy until proven otherwise", async () => {
    server.use(http.get(`${apiUrl}/instants/:url/content`, () => HttpResponse.error()));
    await expect(getContent("x")).rejects.toThrow();
    expect(isHealthy()).toBe(false);

    setApiUrl("http://10.0.0.42:9001");

    expect(isHealthy()).toBe(true);
  });
});

describe("connection error notifications", () => {
  it("fires on every connection failure, not only the first", async () => {
    let count = 0;
    const unsubscribe = onConnectionError(() => {
      count += 1;
    });

    server.use(http.post(`${apiUrl}/bot/play`, () => HttpResponse.error()));
    await expect(playOnDiscord("x")).rejects.toThrow();
    await expect(playOnDiscord("x")).rejects.toThrow();
    await expect(playOnDiscord("x")).rejects.toThrow();

    unsubscribe();
    expect(count).toBe(3);
  });

  it("does not fire when the backend answered", async () => {
    let count = 0;
    const unsubscribe = onConnectionError(() => {
      count += 1;
    });

    server.use(
      http.post(`${apiUrl}/bot/play`, () => errorAt200("not_found", "não existe"))
    );
    await expect(playOnDiscord("x")).rejects.toThrow();

    unsubscribe();
    expect(count).toBe(0);
  });

  it("stops firing after unsubscribe", async () => {
    let count = 0;
    onConnectionError(() => {
      count += 1;
    })();

    server.use(http.post(`${apiUrl}/bot/play`, () => HttpResponse.error()));
    await expect(playOnDiscord("x")).rejects.toThrow();

    expect(count).toBe(0);
  });

  it("ignores a listener that is not a function", () => {
    // Deliberately wrong: the guard exists for untyped callers.
    expect(() => onConnectionError(undefined as never)()).not.toThrow();
  });
});

describe("health does not confuse a decoding failure with a dead server", () => {
  it("stays healthy when /bot/play answers 200 with no data envelope", async () => {
    server.use(
      http.post(`${apiUrl}/bot/play`, () =>
        errorAt200("not_found", "O instant não existe mais")
      )
    );

    await expect(playOnDiscord("x")).rejects.toThrow();
    expect(isHealthy()).toBe(true);
  });
})

describe("normalizeApiUrl", () => {
  it("accepts a well-formed http(s) url with a host", () => {
    expect(normalizeApiUrl("http://10.0.0.20:9001")).toBe("http://10.0.0.20:9001");
  });

  it("rejects the same shapes setApiUrl does", () => {
    expect(normalizeApiUrl("not a server")).toBeNull();
    expect(normalizeApiUrl("10.0.0.20:9001")).toBeNull();
  });
});

describe("testServer", () => {
  const candidate = "http://10.0.0.55:9001";

  it("resolves the bot status on a reachable server", async () => {
    server.use(
      http.get(`${candidate}/bot/status`, () => success({ connected: false }))
    );

    await expect(testServer(candidate)).resolves.toEqual({ connected: false });
  });

  it("rejects with a null-label ApiError when nothing answers", async () => {
    server.use(http.get(`${candidate}/bot/status`, () => HttpResponse.error()));

    await expect(testServer(candidate)).rejects.toMatchObject({
      label: null,
      message: "Erro desconhecido, tente novamente mais tarde"
    });
  });

  it("rejects with the backend's label and message on a real error status", async () => {
    server.use(
      http.get(`${candidate}/bot/status`, () =>
        errorAtStatus(500, { label: "boom", message: "Falha no servidor" })
      )
    );

    await expect(testServer(candidate)).rejects.toMatchObject({
      label: "boom",
      message: "Falha no servidor"
    });
  });

  it("rejects when a 200 response carries no data envelope", async () => {
    server.use(http.get(`${candidate}/bot/status`, () => HttpResponse.json({})));

    await expect(testServer(candidate)).rejects.toBeInstanceOf(ApiError);
  });

  it("never touches the app's live health state or fires a connection error, on success or failure", async () => {
    const seenHealth: boolean[] = [];
    const unsubscribeHealth = onHealthChange((next) => seenHealth.push(next));
    let connectionErrors = 0;
    const unsubscribeError = onConnectionError(() => {
      connectionErrors += 1;
    });

    expect(isHealthy()).toBe(true);

    server.use(http.get(`${candidate}/bot/status`, () => HttpResponse.error()));
    await expect(testServer(candidate)).rejects.toThrow();
    expect(isHealthy()).toBe(true);

    server.resetHandlers();
    server.use(http.get(`${candidate}/bot/status`, () => success({ connected: false })));
    await testServer(candidate);
    expect(isHealthy()).toBe(true);

    expect(seenHealth).toEqual([]);
    expect(connectionErrors).toBe(0);

    unsubscribeHealth();
    unsubscribeError();
  });
});

import { t, type SupportedLocale } from "../../shared/i18n";
import {
  describeError,
  ProviderFailure,
  providerFailureMessage,
  type EnhanceMessage,
  type EnhanceProvider,
} from "../../shared/enhance";

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

/** Below the host's fixed 60s plugin RPC timeout so a slow model surfaces as our own error. */
const DEFAULT_TIMEOUT_MS = 20_000;

export function createProvider(config: ProviderConfig): EnhanceProvider {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = resolveEndpoint(config.baseUrl);
  return {
    async complete(messages: EnhanceMessage[]): Promise<string> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            temperature: 0.3,
            // Sized for the 200-character body plus the two short sibling blocks. CJK costs
            // roughly 1.5 tokens per character, and a budget well past the target is what let a
            // runaway completion reach the parser before the ceiling could trim it.
            max_tokens: 600,
            stream: false,
          }),
          signal: controller.signal,
        });
        if (!response.ok)
          throw new ProviderFailure("http", (await response.text()).slice(0, 200), response.status);
        const payload = (await response.json()) as {
          choices?: { finish_reason?: string; message?: { content?: string } }[];
        };
        const choice = payload.choices?.[0];
        // A length-stopped completion is a half-written prompt, not a short one. Say so instead of
        // delivering the fragment as if it were the whole rewrite.
        if (choice?.finish_reason === "length") throw new ProviderFailure("truncatedOutput", "");
        const content = choice?.message?.content?.trim();
        if (!content) throw new ProviderFailure("emptyResponse", "");
        return content;
      } catch (error) {
        // The detail is the timeout itself: the reader is told how long it waited.
        if (controller.signal.aborted || isAbort(error))
          throw new ProviderFailure("timeout", String(timeoutMs));
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Accepts a full endpoint, a `/v1` style base, or a bare host such as DeepSeek's. */
export function resolveEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (/\/v\d+$/.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

export interface ConnectionProbe {
  ok: boolean;
  message: string;
  latencyMs: number;
  endpoint: string;
}

/**
 * Exercises the exact request path the enhancement uses, so a green result means the address, key
 * and model all work together rather than only that the host is reachable. `locale` is the
 * reader's language: a probe message is shown to a person, so it is worded here rather than in the
 * settings screen that only forwards it.
 */
export async function probeConnection(
  config: ProviderConfig,
  locale: SupportedLocale = "zh-CN",
  timeoutMs = 10_000,
): Promise<ConnectionProbe> {
  const baseUrl = config.baseUrl.trim();
  const apiKey = config.apiKey.trim();
  const model = config.model.trim();
  if (!baseUrl || !apiKey || !model)
    return {
      ok: false,
      message: t(locale, "enhance.probe.incomplete"),
      latencyMs: 0,
      endpoint: "",
    };
  const endpoint = resolveEndpoint(baseUrl);
  const started = Date.now();
  try {
    await createProvider({ ...config, baseUrl, apiKey, model, timeoutMs }).complete([
      { role: "system", content: "Reply with the single word: ok" },
      { role: "user", content: "ping" },
    ]);
    return {
      ok: true,
      message: t(locale, "enhance.probe.ok"),
      latencyMs: Date.now() - started,
      endpoint,
    };
  } catch (error) {
    return {
      ok: false,
      message: describeProviderError(locale, error),
      latencyMs: Date.now() - started,
      endpoint,
    };
  }
}

/** Reads the failure's kind and status rather than its wording, so it works in any language. */
function describeProviderError(locale: SupportedLocale, error: unknown): string {
  if (!(error instanceof ProviderFailure)) return describeError(error);
  const detail = providerFailureMessage(locale, error);
  if (error.kind === "timeout") return t(locale, "enhance.probe.timeout", { detail });
  if (error.kind === "http") {
    if (error.status === 401 || error.status === 403)
      return t(locale, "enhance.probe.unauthorized", { detail });
    if (error.status === 404) return t(locale, "enhance.probe.notFound", { detail });
    // The endpoint's own body names the model it refused; that body is not translated.
    if (/model/i.test(error.detail)) return t(locale, "enhance.probe.modelUnavailable", { detail });
  }
  return detail;
}

/** An aborted request is how every fetch implementation reports a timeout. */
function isAbort(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || /abort/i.test(error.message);
}

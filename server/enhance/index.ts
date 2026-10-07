import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import { resolveLocale, t } from "../../shared/i18n";
import {
  enhancePromptRpc,
  notConfiguredResult,
  runEnhancement,
  testEnhanceConnectionRpc,
  unchangedResult,
} from "../../shared/enhance";
import type { ChatViewSettings } from "../../shared/settings";
import { collectEnvironmentProfile } from "./probe";
import { createProvider, probeConnection } from "./provider";

export function registerEnhance(
  server: PluginServerContext,
  readSettings: () => Promise<ChatViewSettings>,
): void {
  server.handle(testEnhanceConnectionRpc, async (input) => {
    const settings = await readSettings();
    const locale = resolveLocale(input.locale);
    // Blank fields fall back to what is stored, so partially edited forms still test something.
    return probeConnection(
      {
        baseUrl: input.baseUrl || settings.enhanceBaseUrl,
        apiKey: input.apiKey || settings.enhanceApiKey,
        model: input.model || settings.enhanceModel,
      },
      locale,
    );
  });
  server.handle(enhancePromptRpc, async (input, context) => {
    const settings = await readSettings();
    // Resolved once: every reason string this call may return is written in the caller's language.
    const locale = resolveLocale(input.locale);
    if (!settings.enhanceEnabled)
      return unchangedResult(input.raw, t(locale, "enhance.reason.disabled"));
    const baseUrl = settings.enhanceBaseUrl.trim();
    const apiKey = settings.enhanceApiKey.trim();
    const model = settings.enhanceModel.trim();
    if (!baseUrl || !apiKey || !model) return notConfiguredResult(input.raw, locale);
    const profile = collectEnvironmentProfile(await resolveRoot(context, input.workspaceId));
    return runEnhancement({
      raw: input.raw,
      profile,
      locale,
      provider: createProvider({ baseUrl, apiKey, model }),
    });
  });
}

/** The workspace directory is the only trustworthy project root; fall back to the plugin cwd. */
async function resolveRoot(context: PluginHandlerContext, workspaceId: string): Promise<string> {
  try {
    const result = await context.paseo.workspaces.list();
    const match = result.entries.find((workspace) => workspace.id === workspaceId) as
      | { directory?: string | null }
      | undefined;
    if (match?.directory) return match.directory;
  } catch {
    // Host unreachable or workspace archived; the plugin cwd is a usable fallback.
  }
  return process.cwd();
}

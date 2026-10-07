import type { PluginServerContext } from "@getpaseo/plugin/server";
import { activitySettings } from "./shared/settings";
import { registerEnhance } from "./server/enhance";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(activitySettings);
  registerEnhance(server, async () => {
    const state = await settings.read();
    return state.status === "ready" ? state.values : activitySettings.schema.parse({});
  });
  return () => {};
}

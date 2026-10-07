import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { collectEnvironmentProfile } from "./probe";
import { probeConnection, resolveEndpoint } from "./provider";

const roots: string[] = [];

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "chat-view-probe-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(root, name), content, "utf8");
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

it("reports unknown for an empty directory instead of throwing", () => {
  const profile = collectEnvironmentProfile(mkdtempSync(join(tmpdir(), "chat-view-probe-")));
  roots.push(profile.root);
  expect(profile).toMatchObject({ projectKind: "unknown", languages: [], frameworks: [] });
  expect(profile.references).toEqual([]);
});

it("reads commands, frameworks and constraints from a node workspace", () => {
  const root = fixture({
    "package.json": JSON.stringify({
      name: "web",
      packageManager: "pnpm@10.18.0",
      engines: { node: ">=20" },
      scripts: { build: "vite build", test: "vitest run", lint: "oxlint ." },
      dependencies: { react: "19.1.0" },
      devDependencies: { typescript: "5.9.3", vitest: "4.1.7" },
    }),
    "pnpm-workspace.yaml": "packages: []",
    "tsconfig.json": '{ "compilerOptions": { "strict": true } }',
    "README.md": "# web\n\n\u4f7f\u7528 pnpm\u3002",
  });
  const profile = collectEnvironmentProfile(root);
  expect(profile.projectKind).toBe("monorepo");
  expect(profile.frameworks).toEqual(["react"]);
  expect(profile.commands).toMatchObject({
    build: "pnpm vite build",
    test: "pnpm vitest run",
    lint: "pnpm oxlint .",
  });
  expect(profile.commands.typecheck).toBeUndefined();
  expect(profile.constraints).toContain("Node \u7248\u672c\u7ea6\u675f\uff1a>=20");
  expect(profile.constraints).toContain("\u5305\u7ba1\u7406\u5668\u9501\u5b9a\u4e3a pnpm@10.18.0");
  expect(profile.constraints).toContain("TypeScript \u5f00\u542f\u4e86 strict");
  expect(profile.conventions.join()).toContain("TypeScript\u3001Vitest");
  expect(profile.references.map((entry) => entry.path)).toContain("README.md");
  expect(profile.hotspots.map((entry) => entry.path)).toContain("src");
});

it("falls back to toolchain-guaranteed commands for rust and go", () => {
  const rust = fixture({ "Cargo.toml": '[package]\nname = "core"\n' });
  expect(collectEnvironmentProfile(rust).commands).toMatchObject({
    build: "cargo build",
    test: "cargo test",
  });
  const go = fixture({ "go.mod": "module example.com/core\n\ngo 1.22\n" });
  expect(collectEnvironmentProfile(go)).toMatchObject({
    languages: ["go"],
    commands: { build: "go build ./...", test: "go test ./..." },
  });
});

it("classifies a library, a cli and a docs-only repository", () => {
  const library = fixture({
    "package.json": JSON.stringify({ name: "kit", exports: { "./x": "./x.js" } }),
  });
  expect(collectEnvironmentProfile(library).projectKind).toBe("library");
  const cli = fixture({
    "package.json": JSON.stringify({ name: "tool", bin: { tool: "./bin.js" } }),
  });
  expect(collectEnvironmentProfile(cli).projectKind).toBe("cli");
  const docs = fixture({ "README.md": "# a", "AGENTS.md": "# b", "CLAUDE.md": "# c" });
  expect(collectEnvironmentProfile(docs).projectKind).toBe("docs");
});

it("normalizes the three provider base URL shapes", () => {
  expect(resolveEndpoint("https://api.openai.com/v1")).toBe(
    "https://api.openai.com/v1/chat/completions",
  );
  expect(resolveEndpoint("https://api.deepseek.com")).toBe(
    "https://api.deepseek.com/v1/chat/completions",
  );
  expect(resolveEndpoint("https://host/v1/chat/completions")).toBe(
    "https://host/v1/chat/completions",
  );
  expect(resolveEndpoint("  ")).toBe("");
});

it("reports a reachable endpoint as connected and echoes the resolved URL", async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    text: async () => "",
  }));
  vi.stubGlobal("fetch", fetchMock);
  const result = await probeConnection(
    {
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "demo-model",
    },
    "zh-CN",
  );
  expect(result.ok).toBe(true);
  expect(result.endpoint).toBe("https://api.example.com/v1/chat/completions");
  expect(result.message).toBe("连接成功");
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(result.endpoint);
  expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
  expect(JSON.parse(String(init.body)).model).toBe("demo-model");
});

it("classifies provider failures into actionable messages", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => '{"error":"invalid api key"}',
    })),
  );
  const unauthorized = await probeConnection(
    {
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-bad",
      model: "m",
    },
    "zh-CN",
  );
  expect(unauthorized.ok).toBe(false);
  expect(unauthorized.message).toContain("密钥被拒绝");
  expect(unauthorized.endpoint).toBe("https://api.example.com/v1/chat/completions");

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("The operation was aborted");
    }),
  );
  const aborted = await probeConnection(
    { baseUrl: "https://x.example", apiKey: "k", model: "m" },
    "zh-CN",
  );
  expect(aborted.message).toContain("连接超时");

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => "no endpoint",
    })),
  );
  const missing = await probeConnection(
    { baseUrl: "https://x.example", apiKey: "k", model: "m" },
    "zh-CN",
  );
  expect(missing.message).toContain("地址不存在");
});

it("words its messages in the caller's language", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
      text: async () => "",
    })),
  );
  const connected = await probeConnection(
    { baseUrl: "https://x.example", apiKey: "k", model: "m" },
    "en-US",
  );
  expect(connected.message).toBe("Connected");

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => "invalid api key",
    })),
  );
  const rejected = await probeConnection(
    { baseUrl: "https://x.example", apiKey: "k", model: "m" },
    "en-US",
  );
  expect(rejected.message).toContain("Key rejected");
});

it("refuses to probe without a complete configuration", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const result = await probeConnection({ baseUrl: "  ", apiKey: "k", model: "m" }, "zh-CN");
  expect(result).toMatchObject({ ok: false, latencyMs: 0, endpoint: "" });
  expect(result.message).toContain("请填写完整");
  expect(fetchMock).not.toHaveBeenCalled();
});

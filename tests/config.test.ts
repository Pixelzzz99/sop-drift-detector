import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("dotenv", () => ({ config: vi.fn() }));

const validConfigJson = {
  jira: { url: "https://jira.example.com", projectKey: "MYCLICK", titlePrefix: "[Back]" },
  gitlab: { url: "https://gitlab.example.com", projectId: 42 },
  confluence: { url: "https://confluence.example.com", rootPageId: "100" },
  daysBack: 7,
};

function setSecretEnv() {
  process.env.JIRA_TOKEN = "jira-token";
  process.env.GITLAB_TOKEN = "gitlab-token";
  process.env.CONFLUENCE_TOKEN = "confluence-token";
  process.env.ANTHROPIC_API_KEY = "anthropic-key";
}

function clearSecretEnv() {
  delete process.env.JIRA_TOKEN;
  delete process.env.GITLAB_TOKEN;
  delete process.env.CONFLUENCE_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
}

function mockConfigFile(content: unknown) {
  vi.doMock("fs", () => ({
    existsSync: () => true,
    readFileSync: () => JSON.stringify(content),
  }));
}

describe("config", () => {
  beforeEach(() => {
    vi.resetModules();
    clearSecretEnv();
  });

  it("merges config.json settings with env secrets into the exported config", async () => {
    setSecretEnv();
    mockConfigFile(validConfigJson);

    const { config } = await import("../src/config");

    expect(config).toEqual({
      jira: {
        url: "https://jira.example.com",
        apiToken: "jira-token",
        projectKey: "MYCLICK",
        titlePrefixes: ["[Back]"],
      },
      gitlab: {
        url: "https://gitlab.example.com",
        apiToken: "gitlab-token",
        projectId: 42,
      },
      confluence: {
        url: "https://confluence.example.com",
        apiToken: "confluence-token",
        rootPageId: "100",
      },
      anthropic: { apiKey: "anthropic-key" },
      daysBack: 7,
    });
  });

  it("throws a clear error when config.json does not exist", async () => {
    setSecretEnv();
    vi.doMock("fs", () => ({
      existsSync: () => false,
      readFileSync: () => "",
    }));

    await expect(import("../src/config")).rejects.toThrow(/config\.json not found/);
  });

  it("throws a clear error when config.json is not valid JSON", async () => {
    setSecretEnv();
    vi.doMock("fs", () => ({
      existsSync: () => true,
      readFileSync: () => "{ not valid json",
    }));

    await expect(import("../src/config")).rejects.toThrow(/not valid JSON/);
  });

  it("throws a clear error naming the missing required config.json field", async () => {
    setSecretEnv();
    mockConfigFile({
      jira: { projectKey: "MYCLICK" }, // missing jira.url
      gitlab: validConfigJson.gitlab,
      confluence: validConfigJson.confluence,
    });

    await expect(import("../src/config")).rejects.toThrow(/jira\.url/);
  });

  it("throws a clear error when a secret env variable is missing", async () => {
    // secrets left unset
    mockConfigFile(validConfigJson);

    await expect(import("../src/config")).rejects.toThrow(/JIRA_TOKEN/);
  });

  it("applies defaults for optional fields omitted from config.json", async () => {
    setSecretEnv();
    mockConfigFile({
      jira: { url: "https://jira.example.com" },
      gitlab: { url: "https://gitlab.example.com", projectId: 1 },
      confluence: { url: "https://confluence.example.com", rootPageId: "1" },
    });

    const { config } = await import("../src/config");

    expect(config.jira.projectKey).toBe("MYCLICK");
    expect(config.jira.titlePrefixes).toEqual(["[Back]"]);
    expect(config.daysBack).toBe(7);
  });

  it("accepts an array of title prefixes in config.json", async () => {
    setSecretEnv();
    mockConfigFile({
      ...validConfigJson,
      jira: { ...validConfigJson.jira, titlePrefix: ["[Back]", "[API]"] },
    });

    const { config } = await import("../src/config");

    expect(config.jira.titlePrefixes).toEqual(["[Back]", "[API]"]);
  });
});

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config();

function required(key: string): string {
    const value = process.env[key];
    if(!value) throw new Error(`Missing required env variable: ${key}`);
    return value;
}

function loadConfigJson(): Record<string, any> {
    const configPath = path.join(process.cwd(), 'config.json');

    if (!fs.existsSync(configPath)) {
        throw new Error(
            `config.json not found at ${configPath}. Edit config.json in the project root and fill in your Jira/GitLab/Confluence settings.`,
        );
    }

    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (err) {
        throw new Error(`config.json is not valid JSON: ${(err as Error).message}`);
    }
}

function requiredJson<T = any>(json: Record<string, any>, keyPath: string): T {
    const value = keyPath.split('.').reduce((obj: any, key) => obj?.[key], json);
    if (value === undefined || value === null || value === '') {
        throw new Error(`Missing required field "${keyPath}" in config.json`);
    }
    return value as T;
}

function normalizePrefixes(value: unknown, fallback: string[]): string[] {
    if (Array.isArray(value) && value.length > 0) return value;
    if (typeof value === 'string' && value) return [value];
    return fallback;
}

const json = loadConfigJson();

export const config = {
    jira: {
        url: requiredJson<string>(json, 'jira.url'),
        apiToken: required("JIRA_TOKEN"),
        projectKey: json.jira?.projectKey || "MYCLICK",
        titlePrefixes: normalizePrefixes(json.jira?.titlePrefix, ["[Back]"]),
    },
    gitlab: {
        url: requiredJson<string>(json, 'gitlab.url'),
        apiToken: required("GITLAB_TOKEN"),
        projectId: parseInt(String(requiredJson(json, 'gitlab.projectId')), 10),
    },
    confluence: {
        url: requiredJson<string>(json, 'confluence.url'),
        apiToken: required("CONFLUENCE_TOKEN"),
        rootPageId: requiredJson<string>(json, 'confluence.rootPageId'),
    },
    anthropic: {
        apiKey: required("ANTHROPIC_API_KEY"),
    },
    daysBack: parseInt(json.daysBack, 10) || 7,
}

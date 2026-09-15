import * as dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
    const value = process.env[key];
    if(!value) throw new Error(`Missing required env variable: ${key}`);
    return value;
}

export const config = {
    jira: {
        url: required('JIRA_URL'),
        username: required('JIRA_USERNAME'),
        apiToken: required("JIRA_TOKEN"),
        projectKey: process.env.JIRA_PROJECT_KEY || "MYCLICK",
    },
    gitlab: {
        url: required("GITLAB_URL"),
        apiToken: required("GITLAB_TOKEN"),
        projectId: parseInt(required("GITLAB_PROJECT_ID"), 10),
    },
    confluence: {
        url: required("CONFLUENCE_URL"),
        username: required("CONFLUENCE_USERNAME"),
        apiToken: required("CONFLUENCE_TOKEN"),
        rootPageId: required("CONFLUENCE_ROOT_PAGE_ID"),
    },
    anthropic: {
        apiKey: required("ANTHROPIC_API_KEY"),
    },
    daysBack: parseInt(process.env.DAYS_BACK || '7', 10),
}

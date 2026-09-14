import { JiraClient, JiraIssue } from './clients/jira.client';

export interface ReportEntity {
    issue: JiraIssue;
}

async function main(){
    const jiraClient = new JiraClient();


    const issues = await jiraClient.getRecentlyClosedIssues();
    if(issues.length === 0){
        console.log(`No closed issues found. Exiting`);
        return;
    }
}

main().catch(err => {
    console.error('Error in main execution:', err);
    process.exit(1);
});



import { asyncSpan, span } from "../utils/span";
import { Timer } from "../utils/timer"
import { PullRequest } from "@octokit/webhooks-definitions/schema"
import { graphql } from "@octokit/graphql"
import { RequestParameters } from "@octokit/graphql/dist-types/types";
import { defaultClient as telemetry } from "applicationinsights"
import beeline = require("honeycomb-beeline");

export class GitHubClient {
    @asyncSpan('github.enableGitHubAutoMerge', { result: '$result' })
    static async enableGitHubAutoMerge(accessToken: string, pr: PullRequest): Promise<boolean> {
        const result = await this.callGraphQL<{
            enablePullRequestAutoMerge?: {
                pullRequest?: {
                    autoMergeRequest?: {
                        enabledAt?: string,
                        enabledBy?: {
                            login?: string
                        }
                    }
                }
            }
        }>(
            'enablePullRequestAutoMerge',
            `
            mutation EnableAutoMerge($pullRequest: ID!) {
                enablePullRequestAutoMerge(input: {pullRequestId: $pullRequest}) {
                    pullRequest {
                        autoMergeRequest {
                            enabledAt,
                            enabledBy { login }
                        }
                    }
                }
            }
            `,
            {
                pullRequest: pr.node_id,
                headers: {
                    authorization: `token ${accessToken}`
                }
            }
        )

        const autoMergeResult = result?.enablePullRequestAutoMerge?.pullRequest?.autoMergeRequest

        return !!autoMergeResult?.enabledAt
    }

    @asyncSpan('github.enableDependabotAutoMerge', { result: '$result' })
    static async enableDependabotAutoMerge(accessToken: string, pr: PullRequest): Promise<boolean> {
        const result = await this.callGraphQL<{
            addComment?: {
                subject?: {
                    id?: string
                }
            }
        }>(
            'addComment',
            `
        mutation DependabotMergeComment($pullRequest: ID!, $comment: String!) {
            addComment(input: {
                subjectId: $pullRequest,
                body: $comment
            }) {
                subject { id }
            }
        }
        `,
            {
                pullRequest: pr.node_id,
                comment: "@dependabot merge",
                headers: {
                    authorization: `token ${accessToken}`
                }
            }
        )

        return !result?.addComment?.subject?.id
    }

    @asyncSpan('github.graphql', { result: '$result' })
    private static async callGraphQL<T>(operation: string, request: string, payload: RequestParameters): Promise<T> {
        const requestParams = Object.assign({}, payload, { headers: null });

        beeline.addContext({
            name: `github.graphql.${operation}`,
            "request.body": request,
            "request.params": requestParams
        })

        const timer = new Timer()
        const result = await graphql<T>(
            request,
            payload
        )

        beeline.addContext({
            "response.body": result
        })

        telemetry.trackDependency({
            name: `GitHub GraphQL: ${operation}`,
            target: `github+graphql://${operation}`,
            data: JSON.stringify(requestParams),
            dependencyTypeName: "GRAPHQL",
            duration: timer.elapsed,
            resultCode: 200,
            success: true,
            properties: {
                result: JSON.stringify(result)
            }
        })

        return result
    }
}
import { asyncSpan, span, currentSpan } from "./span.js";
import type { PullRequest } from "@octokit/webhooks-definitions/schema.js"
import { graphql } from "@octokit/graphql"
import { RequestParameters } from "@octokit/types";
import { FeaturesClient } from "./featureflags.js";

export class GitHubClient {
    @asyncSpan('github.approvePullRequest', { result: '$result' })
    static async approvePullRequest(accessToken: string, pr: PullRequest, comment: string = "Approved"): Promise<boolean> {
        const span = currentSpan()
        try {
            const result = await this.callGraphQL<{
                addPullRequestReview?: {
                    pullRequestReview?: {
                        id?: string
                    }
                }
            }>(
                'addPullRequestReview',
                `mutation DependabotApprovePR($pullRequest: ID!, $comment: String!) {
                    addPullRequestReview(input: {
                      pullRequestId: $pullRequest,
                      body: $comment,
                      event: APPROVE
                    }) {
                      pullRequestReview {
                        id
                      }
                    }
                  }`,
                {
                    pullRequest: pr.node_id,
                    comment,
                    headers: {
                        authorization: `token ${accessToken}`
                    }
                }
            )

            return !!result?.addPullRequestReview?.pullRequestReview?.id
        } catch(err) {
            span.recordException(err)
            return false
        }
    }

    @asyncSpan('github.enableGitHubAutoMerge', { result: '$result' })
    static async enableGitHubAutoMerge(accessToken: string, pr: PullRequest): Promise<boolean> {
        const span = currentSpan()
        try {
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
        } catch(err) {
            span.recordException(err)
            return false
        }
    }

    @asyncSpan('github.enableDependabotAutoMerge', { result: '$result' })
    static async enableDependabotAutoMerge(accessToken: string, pr: PullRequest): Promise<boolean> {
        const span = currentSpan()
        try {
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

            return !!result?.addComment?.subject?.id
        } catch(err) {
            span.recordException(err)
            return false
        }
    }

    @asyncSpan('github.graphql', { result: '$result', "otel.kind": "CLIENT", "rpc.system": "graphql", "rpc.service": "github" })
    private static async callGraphQL<T>(operation: string, request: string, payload: RequestParameters): Promise<T> {
        let span = currentSpan()
        const requestParams = Object.assign({}, payload, { headers: null });

        span.setAttributes({
            name: `github.graphql.${operation}`,
            "graphql.document": request,
            "graphql.params": JSON.stringify(requestParams)
        })

        const result = await graphql<T>(
            request,
            payload
        )

        span.setAttribute("response.body", JSON.stringify(result))

        return result
    }
}
import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import { defaultClient as telemetry, setup, DistributedTracingModes, startOperation, wrapWithCorrelationContext, getCorrelationContext } from "applicationinsights"
import { WebhookEventMap, PingEvent, PullRequestEvent, PullRequest } from "@octokit/webhooks-definitions/schema"
import { generateSignature } from "../utils/github"
import { graphql } from "@octokit/graphql"
import { Timer } from "../utils/timer"
import { safeIndex } from "../utils/safeindex"

type HandlerMap = { [kind in keyof WebhookEventMap]?: (context: Context, req: HttpRequest, payload: WebhookEventMap[kind]) => Promise<string> }

/**
 * These are the Bot accounts which we trust to create PRs on which auto merge will be enabled.
 */
const trustedAccounts = [
    "dependabot[bot]",
    "dependabot-preview[bot]",
    "notheotherben"
]

setup().start()

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const correlationContext = startOperation(context, req)

    return wrapWithCorrelationContext(async () => {
        const timer = new Timer()

        await handleWebhook(context, req)

        telemetry.trackRequest({
            id: correlationContext.operation.parentId,
            name: `${context.req.method} ${context.req.url}`,
            resultCode: context.res.status || (context.res.body ? 200 : 204),
            success: true,
            url: req.url,
            duration: timer.elapsed,
            properties: {
                ...context.res
            }
        })

        telemetry.flush()
    }, correlationContext)()
};

async function handleWebhook(context: Context, req: HttpRequest) {
    const webhookEvent = req.headers["x-github-event"] || 'ping'

    context.log(`Received GitHub webhook ${webhookEvent} event`)
    telemetry.trackEvent({
        name: "GitHub Webhook Event",
        properties: {
            headers: req.headers,
            body: req.body
        }
    })


    if (!validatePayload(context, req)) {
        context.log.error("Received an invalid request signature, ignoring webhook.")
        context.res = {
            status: 401,
            body: "Invalid request signature"
        }
        return
    }

    context.log("Webhook event passed signature validation.")

    const handlerMap: HandlerMap = {
        ping: onPing,
        pull_request: onPullRequest
    }


    const handler = handlerMap[webhookEvent]
    if (!handler) {
        context.log(`Got a ${webhookEvent} event, which we do not currently support.`)
        return
    }

    context.res = {
        // status: 200, /* Defaults to 200 */
        body: await handler(context, req, req.body)
    }
}

function validatePayload(context: Context, req: HttpRequest): boolean {
    context.log("Verifying request payload hash")

    const secret = process.env["WEBHOOK_SECRET"] || ""

    // If the secret is missing, then don't accept any webhooks
    if (!secret) {
        telemetry.trackException({
            exception: new Error("Received an invalid request signature, ignoring webhook")
        })
        return false
    }

    const expectedSignature = generateSignature(secret, req.rawBody)
    const actualSignature = req.headers["x-hub-signature-256"] || "No Signature"

    telemetry.trackTrace({
        message: `Got payload signature '${actualSignature}', expected '${expectedSignature}' (matches: ${actualSignature === expectedSignature})`,
        properties: {
            actualSignature,
            expectedSignature
        }
    })

    if (actualSignature !== expectedSignature) {
        telemetry.trackException({
            exception: new Error("Received an invalid request signature, ignoring webhook"),
            properties: {
                expectedSignature,
                actualSignature
            }
        })

        return false
    }

    return true
}

async function onPing(context: Context, req: HttpRequest, payload: PingEvent): Promise<string> {
    context.log("Got ping request, responding with pong.")
    return "pong"
}

async function onPullRequest(context: Context, req: HttpRequest, payload: PullRequestEvent): Promise<string> {
    if (payload.action !== "opened" || !trustedAccounts.includes(payload.sender.login)) {
        telemetry.trackEvent({
            name: "Ignoring Pull Request",
            properties: {
                action: payload.action,
                author: payload.sender.login
            }
        })

        return `Ignoring pull_request:${payload.action}, not a new PR or not created by a trusted account.`
    }

    context.log(`Received a dependabot PR for ${payload.repository.full_name}`)
    const accessToken = process.env["GITHUB_ACCESS_TOKEN"] || ""
    if (!accessToken) {
        telemetry.trackException({
            exception: new Error("No GITHUB_ACCESS_TOKEN has been set, cannot modify pull requests.")
        })
        return `Ignoring pull_request:opened, no GitHub access token has been configured.`
    }

    context.log(`Enabling GitHub auto-merge behaviour on this PR`)
    try {
        const timer = new Timer()
        const result = await graphql<{
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
                pullRequest: (<PullRequest>payload.pull_request).node_id,
                headers: {
                    authorization: `token ${accessToken}`
                }
            }
        )

        telemetry.trackDependency({
            name: "GitHub GraphQL: EnableAutoMerge",
            target: "github+graphql://enablePullRequestAutoMerge",
            data: `$pullRequest = ${(<PullRequest>payload.pull_request).node_id}`,
            dependencyTypeName: "GRAPHQL",
            duration: timer.elapsed,
            resultCode: 200,
            success: true,
            properties: {
                result: JSON.stringify(result)
            }
        })

        const autoMergeResult = result?.enablePullRequestAutoMerge?.pullRequest?.autoMergeRequest

        if (!!autoMergeResult?.enabledAt)
            return `Auto-merge enabled for PR.`
        else {
            context.log.error(`Failed to enable GitHub auto-merge: `, autoMergeResult)

            // If this is the dependabot account, then let's try commenting on the PR instead
            if (payload.sender.login.startsWith("dependabot")) {
                timer.reset()
                const result = await graphql<{
                    addComment?: {
                        subject?: {
                            id?: string
                        }
                    }
                }>(
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
                        pullRequest: (<PullRequest>payload.pull_request).node_id,
                        comment: "@dependabot merge",
                        headers: {
                            authorization: `token ${accessToken}`
                        }
                    }
                )

                telemetry.trackDependency({
                    name: "GitHub GraphQL: DependabotMergeComment",
                    target: "github+graphql://addComment",
                    data: `$pullRequest = ${(<PullRequest>payload.pull_request).node_id}, $comment = "@dependabot merge"`,
                    dependencyTypeName: "GRAPHQL",
                    duration: timer.elapsed,
                    resultCode: 200,
                    success: true,
                    properties: {
                        result: JSON.stringify(result)
                    }
                })

                if (!!result?.addComment?.subject?.id)
                    return "Auto-merge enabled for PR using '@dependabot merge'"
            }

            return `Auto-merge could not be enabled for this PR.`
        }
    } catch (error) {
        telemetry.trackException({
            exception: error
        })
        return `Auto-merge could not be enabled for this PR.`
    }
}

export default httpTrigger;
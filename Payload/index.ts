import { asyncSpan, span, telemetrySetup, trackException } from "../utils/span";
telemetrySetup()

import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import { defaultClient as telemetry } from "applicationinsights"
import { WebhookEventMap, PingEvent, PullRequestEvent, PullRequest } from "@octokit/webhooks-definitions/schema"
import { generateSignature } from "../utils/github"
import beeline = require("honeycomb-beeline");
import { Handler } from "../utils/handler";
import { GitHubClient } from "./graphql";

type HandlerMap = { [kind in keyof WebhookEventMap]?: (context: Context, req: HttpRequest, payload: WebhookEventMap[kind]) => Promise<string> }

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    return await GitHubHandler.trigger(context, req, GitHubHandler)
};

class GitHubHandler extends Handler {
    handlerMap: HandlerMap = {
        ping: this.onPing,
        pull_request: this.onPullRequest
    }

    githubClient = new GitHubClient()

    @asyncSpan('github.handle', { stage: "pre-start" })
    async handle(context: Context, req: HttpRequest) {
        const webhookEvent = req.headers["x-github-event"] || 'ping'

        beeline.addContext({
            stage: "telemetry-init"
        })

        context.log(`Received GitHub webhook ${webhookEvent} event`)
        telemetry.trackEvent({
            name: "GitHub Webhook Event",
            properties: {
                headers: req.headers,
                body: req.body
            }
        })

        beeline.addContext({
            "request.headers": req.headers,
            "request.body": req.body,
            "github.event": webhookEvent
        })


        beeline.addContext({
            stage: "validate-signature"
        })

        if (!this.validatePayload(context, req)) {
            context.log.error("Received an invalid request signature, ignoring webhook.")
            context.res = {
                status: 401,
                body: "Invalid request signature"
            }
            return
        }

        context.log("Webhook event passed signature validation.")

        beeline.addContext({
            stage: "handler-lookup"
        })

        const handler = this.handlerMap[webhookEvent]
        if (!handler) {
            context.log(`Got a ${webhookEvent} event, which we do not currently support.`)
            context.res = {
                body: "Webhook type is not supported.",
            }
            return
        }

        beeline.addContext({
            stage: "handler-run"
        })

        context.res = {
            // status: 200, /* Defaults to 200 */
            body: await handler(context, req, req.body)
        }

        beeline.addContext({
            "response.body": context.res.body,
            stage: "complete"
        })
    }


    @span('github.validatePayload', { result: '$result' })
    validatePayload(context: Context, req: HttpRequest): boolean {
        context.log("Verifying request payload hash")

        const secret = process.env["WEBHOOK_SECRET"] || ""

        // If the secret is missing, then don't accept any webhooks
        if (!secret) {
            trackException(new Error("Received an invalid request signature, ignoring webhook"))
            return false
        }

        const expectedSignature = beeline.withSpan({
            name: "github.generateSignature"
        }, () => generateSignature(secret, req.rawBody))
        const actualSignature = req.headers["x-hub-signature-256"] || "No Signature"

        telemetry.trackTrace({
            message: `Got payload signature '${actualSignature}', expected '${expectedSignature}' (matches: ${actualSignature === expectedSignature})`,
            properties: {
                actualSignature,
                expectedSignature
            }
        })

        beeline.addContext({
            expectedSignature,
            actualSignature
        })

        if (actualSignature !== expectedSignature) {
            trackException(new Error("Received an invalid request signature, ignoring webhook"), {
                expectedSignature,
                actualSignature
            })

            return false
        }

        return true
    }

    @asyncSpan('github.on.ping', { result: '$result' })
    async onPing(context: Context, req: HttpRequest, payload: PingEvent): Promise<string> {
        context.log("Got ping request, responding with pong.")
        return "pong"
    }

    @asyncSpan('github.on.pull_request', { result: '$result' })
    async onPullRequest(context: Context, req: HttpRequest, payload: PullRequestEvent): Promise<string> {
        const trustedAccounts = (process.env["TRUSTED_ACCOUNTS"] || "dependabot[bot],dependabot-preview[bot]").split(',')

        beeline.addContext({
            trustedAccounts,
            "pull_request.action": payload.action,
            "pull_request.user": payload.sender.login
        })

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
            trackException(new Error("No GITHUB_ACCESS_TOKEN has been set, cannot modify pull requests."))
            return `Ignoring pull_request:opened, no GitHub access token has been configured.`
        }

        context.log(`Enabling GitHub auto-merge behaviour on this PR`)
        try {
            if (await this.githubClient.enableGitHubAutoMerge(accessToken, <PullRequest>payload.pull_request))
                return `Auto-merge enabled for PR.`
            else if (payload.sender.login.startsWith("dependabot") && await this.githubClient.enableDependabotAutoMerge(accessToken, <PullRequest>payload.pull_request))
                return "Auto-merge enabled for PR using '@dependabot merge'"

            return `Auto-merge could not be enabled for this PR.`
        } catch (error) {
            trackException(error)
            return `Auto-merge could not be enabled for this PR.`
        }
    }
}


export default httpTrigger;
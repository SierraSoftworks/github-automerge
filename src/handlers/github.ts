import { asyncSpan, currentSpan, span, wrap } from "../utils/span";
import { InvocationContext, HttpRequest, HttpResponse, HttpResponseInit, HttpMethod } from "@azure/functions"
import { WebhookEventMap, PingEvent, PullRequestEvent, PullRequest } from "@octokit/webhooks-definitions/schema"
import { generateSignature } from "../utils/github"
import { Handler } from "../utils/handler";
import { GitHubClient } from "../utils/graphql";
import { jsonHeaders } from "../utils/headers";
import { SpanStatusCode } from "@opentelemetry/api";


type HandlerMap = { [kind in keyof WebhookEventMap]?: (req: HttpRequest, context: InvocationContext, payload: WebhookEventMap[kind]) => Promise<string> }

export class GitHubHandler extends Handler {
    methods?: HttpMethod[] = ["POST"]

    handlerMap: HandlerMap = {
        ping: this.onPing,
        pull_request: this.onPullRequest
    }

    @asyncSpan('github.handle', { stage: "pre-start" })
    async handle(req: HttpRequest, context: InvocationContext): Promise<HttpResponse|HttpResponseInit> {
        const webhookEvent = req.headers.get("x-github-event") || 'ping'

        const span = currentSpan()
        span.setAttribute('stage', "initialize")

        const body = await req.text()

        context.log(`Received GitHub webhook ${webhookEvent} event`)
        span.addEvent(
            "GitHub Webhook Event",
            {
                headers: jsonHeaders(req),
                body
            }
        )

        span.setAttributes({
            "request.host": req.headers.get('host'),
            "request.headers": jsonHeaders(req),
            "request.body": body,
            "github.event": webhookEvent,
            'github.delivery': req.headers.get('x-github-delivery')
        })


        span.setAttribute('stage', "validate-signature")

        if (!this.validatePayload(req, context, body)) {
            context.error("Received an invalid request signature, ignoring webhook.")
            return {
                status: 401,
                body: "Invalid request signature"
            }
        }

        context.log("Webhook event passed signature validation.")

        span.setAttribute('stage', "handler-lookup")

        const handler = this.handlerMap[webhookEvent]
        if (!handler) {
            context.log(`Got a ${webhookEvent} event, which we do not currently support.`)
            return {
                body: "Webhook type is not supported.",
            }
        }

        span.setAttribute('stage', "handler-run")

        const result = await handler(req, context, req.body)

        span.setAttributes({
            "response.body": result,
            stage: "complete"
        })

        return {
            body: result
        }
    }


    @span('github.validatePayload', { result: '$result' })
    validatePayload(req: HttpRequest, context: InvocationContext, body: string): boolean {
        const span = currentSpan()
        context.log("Verifying request payload hash")

        const secret = process.env["WEBHOOK_SECRET"] || ""

        // If the secret is missing, then don't accept any webhooks
        if (!secret) {
            span.recordException(new Error("Received an invalid request signature, ignoring webhook"))
            return false
        }

        const expectedSignature = wrap("github.generateSignature", {}, () => generateSignature(secret, body))
        const actualSignature = req.headers.get("x-hub-signature-256") || "No Signature"

        span.addEvent(
            `Got payload signature '${actualSignature}', expected '${expectedSignature}' (matches: ${actualSignature === expectedSignature})`,
            {
                actualSignature,
                expectedSignature
            }
        )

        span.setAttributes({
            expectedSignature,
            actualSignature
        })

        if (actualSignature !== expectedSignature) {
            span.recordException(new Error("Received an invalid request signature, ignoring webhook"))
            return false
        }

        return true
    }

    @asyncSpan('github.on.ping', { result: '$result' })
    async onPing(req: HttpRequest, context: InvocationContext, payload: PingEvent): Promise<string> {
        context.log("Got ping request, responding with pong.")
        return "pong"
    }

    @asyncSpan('github.on.pull_request', { result: '$result' })
    async onPullRequest(req: HttpRequest, context: InvocationContext, payload: PullRequestEvent): Promise<string> {
        const span = currentSpan()

        const pull_request_user = (payload.pull_request as any).user?.login || payload.sender?.login || "unknown"
        const trustedAccounts = (process.env["TRUSTED_ACCOUNTS"] || "dependabot[bot],dependabot-preview[bot]").split(',')

        span.setAttributes({
            trustedAccounts,
            "pull_request.action": payload.action,
            "pull_request.user": pull_request_user
        })

        if (payload.action !== "opened" || !trustedAccounts.includes(pull_request_user)) {
            span.addEvent(
                "Ignoring Pull Request",
                {
                    action: payload.action,
                    author: pull_request_user
                }
            )

            span.setStatus({ code: SpanStatusCode.OK, message: "Not a new PR or not created by a trusted account." })
            return `Ignoring pull_request:${payload.action}, not a new PR or not created by a trusted account.`
        }

        context.log(`Received a dependabot PR for ${payload.repository.full_name}`)
        const accessToken = process.env["GITHUB_ACCESS_TOKEN"] || ""
        if (!accessToken) {
            span.recordException(new Error("No GITHUB_ACCESS_TOKEN has been set, cannot modify pull requests."))
            span.setStatus({ code: SpanStatusCode.OK, message: "Auto-merge enabled for PR." })
            return `Ignoring pull_request:opened, no GitHub access token has been configured.`
        }

        context.log(`Approving the PR with a note about automated approval for Dependabot PRs`)
        try {
            await GitHubClient.approvePullRequest(accessToken, <PullRequest>payload.pull_request)
        } catch (error) {
            span.recordException(error)
        }

        context.log(`Enabling GitHub auto-merge behaviour on this PR`)
        try {
            if (await GitHubClient.enableGitHubAutoMerge(accessToken, <PullRequest>payload.pull_request))
            {
                span.setStatus({ code: SpanStatusCode.OK, message: "Auto-merge enabled for PR." })
                return `Auto-merge enabled for PR.`
            }
            else if (pull_request_user.startsWith("dependabot") && await GitHubClient.enableDependabotAutoMerge(accessToken, <PullRequest>payload.pull_request))
            {
                span.setStatus({ code: SpanStatusCode.OK, message: "Auto-merge enabled for PR using '@dependabot merge'." })
                return "Auto-merge enabled for PR using '@dependabot merge'."
            }

            span.setStatus({ code: SpanStatusCode.ERROR, message: "Auto-merge could not be enabled for this PR." })
            return `Auto-merge could not be enabled for this PR.`
        } catch (error) {
            span.recordException(error)
            span.setStatus({ code: SpanStatusCode.ERROR, message: "Auto-merge could not be enabled for this PR due to an exception." })
            return `Auto-merge could not be enabled for this PR.`
        }
    }
}
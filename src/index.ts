import { app } from "@azure/functions"
import { HealthHandler } from "./handlers/health"
import { GitHubHandler } from "./handlers/github"

app.get("Health", async (req, context) => {
    return await HealthHandler.trigger(req, context, HealthHandler)
})

app.post("Payload", async (req, context) => {
    return await GitHubHandler.trigger(req, context, GitHubHandler)
})
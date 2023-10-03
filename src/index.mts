import { app } from "@azure/functions"
import { HealthHandler } from "./handlers/health.js"
import { GitHubHandler } from "./handlers/github.js"

app.get("Health", async (req, context) => {
    return await HealthHandler.trigger(req, context, HealthHandler)
})

app.post("Payload", async (req, context) => {
    return await GitHubHandler.trigger(req, context, GitHubHandler)
})
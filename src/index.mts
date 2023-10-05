import { app } from "@azure/functions"
import { HealthHandler } from "./handlers/health.js"
import { GitHubHandler } from "./handlers/github.js"

app.http("Health", new HealthHandler())
app.http("Payload", new GitHubHandler())
import { asyncSpan } from "../utils/span";
import { HttpMethod, HttpRequest, InvocationContext } from "@azure/functions"
import { Handler } from "../utils/handler";

export class HealthHandler extends Handler {
  methods?: HttpMethod[] = ["GET"]

  health: "Healthy" | "Unhealthy" = "Healthy"

  @asyncSpan('health.handle')
  async handle(req: HttpRequest, context: InvocationContext) {
    return {
      // status: 200, /* Defaults to 200 */
      body: this.health
    }
  }
}

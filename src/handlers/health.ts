import { asyncSpan } from "../utils/span";
import { HttpRequest, InvocationContext } from "@azure/functions"
import { Handler } from "../utils/handler";

export class HealthHandler extends Handler {
    @asyncSpan('health.handle')
    async handle(req: HttpRequest, context: InvocationContext) {
        return {
            // status: 200, /* Defaults to 200 */
            body: "Healthy"
        }
    }
}
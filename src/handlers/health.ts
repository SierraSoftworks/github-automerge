import { asyncSpan } from "../utils/span";
import { HttpMethod, HttpRequest, InvocationContext } from "@azure/functions"
import { Handler } from "../utils/handler";
import { jsonHeaders } from "../utils/headers";

export class HealthHandler extends Handler {
    methods?: HttpMethod[] = ["GET"]

    @asyncSpan('health.handle')
    async handler(req: HttpRequest, context: InvocationContext) {
        return {
            // status: 200, /* Defaults to 200 */
            body: "Healthy"
        }
    }
}
import { asyncSpan, telemetrySetup } from "../utils/span";
telemetrySetup()

import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import { Handler } from "../utils/handler";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    return await HealthHandler.trigger(context, req, HealthHandler)
};

class HealthHandler extends Handler {
    @asyncSpan('health.handle')
    async handle(context: Context, req: HttpRequest) {
        context.res = {
            // status: 200, /* Defaults to 200 */
            body: "Healthy"
        }
    }
}


export default httpTrigger;
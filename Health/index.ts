import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import { defaultClient as telemetry, setup, startOperation, wrapWithCorrelationContext } from "applicationinsights"
import { Timer } from "../utils/timer"

setup().start()

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const correlationContext = startOperation(context, req)

    return wrapWithCorrelationContext(async () => {
        const timer = new Timer()

        await handleRequest(context, req)

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

async function handleRequest(context: Context, req: HttpRequest) {
    context.res = {
        // status: 200, /* Defaults to 200 */
        body: "Healthy"
    }
}


export default httpTrigger;
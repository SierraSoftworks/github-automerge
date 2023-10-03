import { InvocationContext, HttpRequest, HttpHandler, HttpResponse, HttpResponseInit } from "@azure/functions";
import { handleHttpRequest } from "./span";

export class Handler {
    public async handle(req: HttpRequest, context: InvocationContext): Promise<HttpResponse|HttpResponseInit> {
        return {
            status: 405,
            body: "Not Implemented"
        }
    }

    static async trigger<T extends typeof Handler>(req: HttpRequest, context: InvocationContext, handler: T): Promise<HttpResponse|HttpResponseInit> {
        const handlerInstance = new handler()

        return await handleHttpRequest(req, context, handlerInstance.handle.bind(handlerInstance))
    }
}
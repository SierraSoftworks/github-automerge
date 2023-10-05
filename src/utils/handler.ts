import { InvocationContext, HttpRequest, HttpHandler, HttpResponse, HttpResponseInit, HttpTriggerOptions, HttpMethod } from "@azure/functions";
import { handleHttpRequest } from "./span";

export abstract class Handler implements HttpTriggerOptions {
    authLevel: 'anonymous' | 'function' | 'admin' = 'anonymous'
    abstract methods?: HttpMethod[]
    route?: string
    
    abstract handler(req: HttpRequest, context: InvocationContext): Promise<HttpResponse|HttpResponseInit>
}
import { InvocationContext, HttpRequest, HttpHandler, HttpResponse, HttpResponseInit, HttpTriggerOptions, HttpMethod } from "@azure/functions";

export abstract class Handler implements HttpTriggerOptions {
    authLevel: 'anonymous' | 'function' | 'admin' = 'anonymous'
    abstract methods?: HttpMethod[]
    route?: string

    public readonly handler: HttpHandler

    constructor() {
        this.handler = this.handle.bind(this)
    }
    
    abstract handle(req: HttpRequest, context: InvocationContext): Promise<HttpResponse|HttpResponseInit>
}
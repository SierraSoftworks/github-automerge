import { Context, HttpRequest } from "@azure/functions";
import { handleHttpRequest } from "./span";

export class Handler {
    public async handle(context: Context, req: HttpRequest): Promise<void> {
        context.res = {
            status: 405,
            body: "Not Implemented"
        }
    }

    static async trigger<T extends typeof Handler>(context: Context, req: HttpRequest, handler: T): Promise<void> {
        const handlerInstance = new handler()

        await handleHttpRequest(context, req, handlerInstance.handle.bind(handlerInstance))
    }
}
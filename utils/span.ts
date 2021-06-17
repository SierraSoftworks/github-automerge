import { Context, HttpRequest } from '@azure/functions'
import * as beeline from 'honeycomb-beeline'
import { defaultClient as telemetry, setup, startOperation, wrapWithCorrelationContext } from "applicationinsights"
import { Timer } from "../utils/timer"

export function telemetrySetup() {
    beeline({
        writeKey: process.env.HONEYCOMB_KEY,
        dataset: 'github-automerge.sierrasoftworks.com',
        serviceName: 'github-automerge',
        httpTraceParserHook: beeline.w3c.httpTraceParserHook,
        httpTracePropagationHook: beeline.w3c.httpTracePropagationHook
    });

    setup().start()
}

export function span(name?: string, other?: object) {
    return function decorate<T extends (...args) => any>(target: Object, propertyKey?: string, descriptor?: TypedPropertyDescriptor<T>) {
        const originalMethod = descriptor.value
        descriptor.value = <any>function (...args) {
            return beeline.withSpan({
                task: name || propertyKey,
                ...(other || {})
            }, () => {
                try {
                    originalMethod.apply(this, args)
                } catch (err) {
                    trackException(err)
                    throw err
                }
            })
        }
        return descriptor
    }
}

export function asyncSpan(name?: string, other?: object) {
    return function decorate<T extends (...args) => any>(target: Object, propertyKey?: string, descriptor?: TypedPropertyDescriptor<T>) {
        const originalMethod = descriptor.value

        descriptor.value = <any>function (...args) {
            return beeline.startAsyncSpan({
                task: name || propertyKey,
                ...(other || {})
            }, async span => {
                try {
                    return await originalMethod.apply(this, args)
                } catch (err) {
                    trackException(err)
                    throw err
                } finally {
                    beeline.finishSpan(span)
                }
            })
        }

        return descriptor
    }
}

export function trackException(err: Error, extraInfo?: Object) {
    beeline.addContext({ exception: err.toString(), ...(extraInfo || {}) })
    telemetry.trackException({
        exception: err,
        properties: extraInfo
    })
}

export async function handleHttpRequest(context: Context, req: HttpRequest, handleRequest: (context: Context, req: HttpRequest) => Promise<void>): Promise<void> {
    const correlationContext = startOperation(context, req)
    const trace = beeline.startTrace({
        task: `${req.method} ${req.url}`,
        "request.path": req.url,
        "request.method": req.method,
        "request.query": req.query
    })

    return wrapWithCorrelationContext(async () => {
        try {
            const timer = new Timer()

            await handleRequest(context, req)

            beeline.addTraceContext({
                "response.status_code": context.res.status || (context.res.body ? 200 : 204)
            })

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
        }
        catch (e) {
            beeline.addTraceContext({ exception: e.toString() })
        } finally {
            telemetry.flush()
            beeline.finishTrace(trace);
        }
    }, correlationContext)()
}
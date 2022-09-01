import { Context, HttpRequest } from '@azure/functions'

import {NodeSDK} from '@opentelemetry/sdk-node'
import {getNodeAutoInstrumentations} from '@opentelemetry/auto-instrumentations-node'
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-proto'
import {Attributes, Span, trace, context as otelcontext} from '@opentelemetry/api'

import { Timer } from "../utils/timer"
import { URL } from "url"

export function telemetrySetup() {
    const traceExporter = new OTLPTraceExporter({
        url: "https://api.honeycomb.io",
        headers: {
            "x-honeycomb-team": process.env.HONEYCOMB_KEY
        }
    });

    const sdk = new NodeSDK({
        traceExporter,
        instrumentations: [getNodeAutoInstrumentations()],
        serviceName: "github-automerge",
    });

    sdk.start();
}

export const tracer = trace.getTracer("github-automerge")

export function currentSpan(): Span {
    return trace.getSpan(otelcontext.active())
}

export function wrap<T>(name: string, attributes: Attributes, fn: () => T): T {
    return tracer.startActiveSpan(name, { attributes }, span => {
        try {
            return fn();
        } catch (err) {
            span.recordException(err)
        } finally {
            span.end()
        }
    })
}

export function wrapAsync<T>(name: string, attributes: Attributes, fn: () => Promise<T>): Promise<T> {
    return tracer.startActiveSpan(name, { attributes }, async span => {
        try {
            return await fn();
        } catch (err) {
            span.recordException(err)
        } finally {
            span.end()
        }
    })
}

export function span(name?: string, other?: Attributes) {
    return function decorate<T extends (...args) => any>(target: Object, propertyKey?: string, descriptor?: TypedPropertyDescriptor<T>) {
        const originalMethod = descriptor.value
        descriptor.value = <any>function (...args) {
            return wrap(name, other, () => originalMethod.apply(this, args))
        }
        return descriptor
    }
}

export function asyncSpan(name?: string, other?: Attributes) {
    return function decorate<T extends (...args) => any>(target: Object, propertyKey?: string, descriptor?: TypedPropertyDescriptor<T>) {
        const originalMethod = descriptor.value

        descriptor.value = <any>function (...args) {
            return wrapAsync(name, other, () => originalMethod.apply(this, args))
        }

        return descriptor
    }
}

export async function handleHttpRequest(context: Context, req: HttpRequest, handleRequest: (context: Context, req: HttpRequest) => Promise<void>): Promise<void> {

    const url = new URL(req.url)

    return tracer.startActiveSpan(
        `${req.method} ${req.url}`,
        {
            attributes: {
                "request.host": url.hostname,
                "request.scheme": url.protocol,
                "request.path": url.pathname,
                "request.method": req.method,
                "request.query": url.search,
                "request.url": req.url,
                "request.client-ip": req.headers['client-ip'],
                'request.user-agent': req.headers['user-agent'],
                'az.function': req.headers['x-site-deployment-id'],
            }
        },
        async span => {
            try {
                await handleRequest(context, req)

                span.setAttribute('response.status_code', context.res.status || (context.res.body ? 200 : 204))
            } catch (err) {
                span.recordException(err)
            } finally {
                span.end()
            }
        }
    )
}
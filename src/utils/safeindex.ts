export function safeIndex(object: any, ...keys: string[]) {
    let ref = object
    keys.forEach(key => {
        if (ref)
            ref = ref[key]
    })

    return ref
}
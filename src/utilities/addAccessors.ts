type ProxiedArray<T extends object> = T[] & T;

const handler: ProxyHandler<object[]> = {
    /**
     * Get a proxied value from the array or property value
     * Note that the property value get works even if you update the underlying object.
     * Also, return true of proxy.__isProxy in order to distinguish proxies and not double proxy them.
     */
    get: (target: object[], prop: string | symbol): unknown => {
        if (prop === "__isProxy") return true;
        if (prop in target) return (target as unknown as Record<string | symbol, unknown>)[prop];
        return (target[0] as Record<string | symbol, unknown>)[prop];
    },

    set: (obj: object[], prop: string | symbol, value: unknown): boolean => {
        if (typeof prop === "string" && !isNaN(Number(prop))) {
            (obj as unknown as Record<string | symbol, unknown>)[prop] = value;
        } else if (prop in obj) {
            (obj as unknown as Record<string | symbol, unknown>)[prop] = value;
        } else {
            (obj[0] as Record<string | symbol, unknown>)[prop] = value;
        }
        return true;
    }
};

/**
 * Add a proxy object for sqZero or the src[0] element if sqZero is unspecified, AND
 * src is an array of length 1.
 *
 * If sqZero isn't passed in, then assume this is a create call on the destination object
 * itself, by:
 * 1. If not an object, return dest
 * 2. If an array of length != 1, return dest
 * 3. If an array, use dest[0] as sqZero
 * 4. Use dest as sqZero
 *
 * @example
 * src = [{a:5,b:'string', c:null}]
 * addAccessors(src)
 * src.c = 'outerChange'
 * src[0].b='innerChange'
 *
 * assert src.a===5
 * assert src[0].c === 'outerChange'
 * assert src.b === 'innerChange'
 */
const addAccessors = <T extends object>(dest: T | T[] | ProxiedArray<T>, sqZero?: T): T | T[] | ProxiedArray<T> => {
    if (typeof dest === "object" && dest !== null && "__isProxy" in dest && dest.__isProxy) return dest;
    let itemZero = sqZero;
    if (itemZero === undefined) {
        if (typeof dest !== "object") return dest;
        if (Array.isArray(dest) && dest.length !== 1) return dest;
        itemZero = Array.isArray(dest) ? dest[0] : dest;
    }
    // dest may have some decorations so keep the object
    if (Array.isArray(dest)) {
        dest.length = 0;
        dest.push(itemZero);
        return new Proxy(dest, handler) as ProxiedArray<T>;
    } else {
        return new Proxy([itemZero], handler) as ProxiedArray<T>;
    }
};

export default addAccessors;

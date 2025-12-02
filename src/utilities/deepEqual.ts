/**
 * Performs a deep equality check between two objects. Used primarily during DICOM write operations
 * to determine whether a data element underlying value has changed since it was initially read.
 *
 * @param obj1 - The first object to compare.
 * @param obj2 - The second object to compare.
 * @returns Returns `true` if the structures and values of the objects are deeply equal, `false` otherwise.
 */
export function deepEqual(obj1: unknown, obj2: unknown): boolean {
    // Use Object.is to consider for treatment of `NaN` and signed 0's i.e. `+0` or `-0` in IS/DS
    if (Object.is(obj1, obj2)) {
        return true;
    }

    // expect objects or a null instance if initial check failed
    if (typeof obj1 !== "object" || typeof obj2 !== "object" || obj1 === null || obj2 === null) {
        return false;
    }

    // all keys should match a deep equality check
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
        return false;
    }

    for (const key of keys1) {
        if (
            !keys2.includes(key) ||
            !deepEqual((obj1 as Record<string, unknown>)[key], (obj2 as Record<string, unknown>)[key])
        ) {
            return false;
        }
    }

    return true;
}

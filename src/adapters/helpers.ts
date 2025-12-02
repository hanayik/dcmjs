/**
 * Interface representing a code sequence in DICOM structured reports
 */
interface CodeSequence {
    CodeValue: string;
    CodingSchemeDesignator: string;
    CodeMeaning: string;
}

/**
 * Interface for content items that have a ConceptNameCodeSequence
 */
interface ContentItemWithCodeMeaning {
    ConceptNameCodeSequence: CodeSequence;
    [key: string]: unknown;
}

/**
 * Interface for content items that may have a GraphicType
 */
interface ContentItemWithGraphicType {
    GraphicType?: string;
    [key: string]: unknown;
}

/**
 * Converts a value to an array. If the value is already an array, returns it as-is.
 * If the value is not an array, wraps it in an array.
 * @param x - The value to convert to an array
 * @returns An array containing the value(s)
 */
const toArray = <T>(x: T | T[]): T[] => (Array.isArray(x) ? x : [x]);

/**
 * Creates a predicate function that checks if a content item's CodeMeaning matches the specified value
 * @param codeMeaningName - The CodeMeaning value to match against
 * @returns A predicate function for filtering/finding content items
 */
const codeMeaningEquals = (codeMeaningName: string) => {
    return (contentItem: ContentItemWithCodeMeaning): boolean => {
        return contentItem.ConceptNameCodeSequence.CodeMeaning === codeMeaningName;
    };
};

/**
 * Creates a predicate function that checks if a content item's GraphicType matches the specified value
 * @param graphicType - The GraphicType value to match against
 * @returns A predicate function for filtering/finding content items
 */
const graphicTypeEquals = (graphicType: string) => {
    return (contentItem: ContentItemWithGraphicType | null | undefined): boolean => {
        return contentItem != null && contentItem.GraphicType === graphicType;
    };
};

export { toArray, codeMeaningEquals, graphicTypeEquals };

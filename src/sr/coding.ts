const _value = Symbol("value");
const _meaning = Symbol("meaning");
const _schemeDesignator = Symbol("schemeDesignator");
const _schemeVersion = Symbol("schemeVersion");

interface CodeOptions {
    value: string;
    meaning: string;
    schemeDesignator: string;
    schemeVersion?: string | null;
}

class Code {
    private [_value]: string;
    private [_meaning]: string;
    private [_schemeDesignator]: string;
    private [_schemeVersion]: string | null;

    constructor(options: CodeOptions) {
        this[_value] = options.value;
        this[_meaning] = options.meaning;
        this[_schemeDesignator] = options.schemeDesignator;
        this[_schemeVersion] = options.schemeVersion || null;
    }

    get value(): string {
        return this[_value];
    }

    get meaning(): string {
        return this[_meaning];
    }

    get schemeDesignator(): string {
        return this[_schemeDesignator];
    }

    get schemeVersion(): string | null {
        return this[_schemeVersion];
    }
}

interface CodedConceptOptions {
    value: string;
    meaning: string;
    schemeDesignator: string;
    schemeVersion?: string;
}

class CodedConcept {
    CodeValue: string;
    CodeMeaning: string;
    CodingSchemeDesignator: string;
    CodingSchemeVersion?: string;

    constructor(options: CodedConceptOptions) {
        if (options.value === undefined) {
            throw new Error("Option 'value' is required for CodedConcept.");
        }
        if (options.meaning === undefined) {
            throw new Error("Option 'meaning' is required for CodedConcept.");
        }
        if (options.schemeDesignator === undefined) {
            throw new Error("Option 'schemeDesignator' is required for CodedConcept.");
        }
        this.CodeValue = options.value;
        this.CodeMeaning = options.meaning;
        this.CodingSchemeDesignator = options.schemeDesignator;
        if ("schemeVersion" in options) {
            this.CodingSchemeVersion = options.schemeVersion;
        }
    }

    equals(other: CodeOptions): boolean {
        if (other.value === this.value && other.schemeDesignator === this.schemeDesignator) {
            if (other.schemeVersion && this.schemeVersion) {
                return other.schemeVersion === this.schemeVersion;
            }
            return true;
        }
        return false;
    }

    get value(): string {
        return this.CodeValue;
    }

    get meaning(): string {
        return this.CodeMeaning;
    }

    get schemeDesignator(): string {
        return this.CodingSchemeDesignator;
    }

    get schemeVersion(): string | undefined {
        return this.CodingSchemeVersion;
    }
}

export { Code, CodedConcept };
export type { CodeOptions, CodedConceptOptions };

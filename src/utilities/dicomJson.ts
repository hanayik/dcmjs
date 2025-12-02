import { PN_COMPONENT_DELIMITER, VM_DELIMITER } from "../constants/dicom";

interface PersonNameComponents {
  Alphabetic?: string;
  Ideographic?: string;
  Phonetic?: string;
}

interface ValueWithAccessors {
  __hasValueAccessors?: boolean;
  toJSON?: () => PersonNameComponents | PersonNameComponents[];
  toString?: () => string;
}

type PNInputValue =
  | string
  | PersonNameComponents
  | PersonNameComponents[]
  | undefined;

/**
 * Converts a PN string to the dicom+json equivalent, or returns the
 * original object
 * @param value - Part10 style PersonName (PN) string (ie 'A^B==C\\D') or object
 * @param multiple - if false returns the first valid PersonName, otherwise returns all PersonNames
 * @returns dicom+json representation of PersonName value, or the same object.
 */
function pnStringToObject(
  value: PNInputValue,
  multiple?: true
): PersonNameComponents[];
function pnStringToObject(
  value: PNInputValue,
  multiple: false
): PersonNameComponents | undefined;
function pnStringToObject(
  value: PNInputValue,
  multiple = true
): PersonNameComponents | PersonNameComponents[] | undefined {
  if (value == undefined) {
    return multiple ? [] : undefined;
  }
  if (typeof value === "string" || value instanceof String) {
    // Direct string assignment:
    //   naturalizedDataset.PatientName = "Doe^John";
    const values = value
      .split(String.fromCharCode(VM_DELIMITER))
      .filter(Boolean);
    const pnObj = values.map(function (v) {
      const components = v.split(String.fromCharCode(PN_COMPONENT_DELIMITER));
      return {
        ...(components[0] ? { Alphabetic: components[0] } : {}),
        ...(components[1] ? { Ideographic: components[1] } : {}),
        ...(components[2] ? { Phonetic: components[2] } : {}),
      };
    });
    return multiple ? pnObj : pnObj[0];
  } else {
    // Direct assignment:
    //   naturalizedDataset.PatientName = {Alphabetic: "John"};
    if (!Array.isArray(value) && multiple) {
      return [Object.assign({}, value)];
    }
    // Verbatim:
    //   naturalizedDataset.PatientName = [{Alphabetic: "John"}];
    return value;
  }
}

/**
 * Returns the dicom part10 equivalent string for a given json object.
 * @param value - The PersonName value to convert
 * @returns dicom part10 equivalent string
 */
function pnObjectToString(value: PNInputValue): string {
  if (typeof value === "string" || value instanceof String) {
    return value as string;
  }

  const pnDelim = String.fromCharCode(PN_COMPONENT_DELIMITER);
  let valueArray: (PersonNameComponents | undefined)[];
  if (!Array.isArray(value)) {
    valueArray = [value];
  } else {
    valueArray = value;
  }
  return valueArray
    .filter(Boolean)
    .map(function (v) {
      if (v === undefined || typeof v === "string" || v instanceof String) {
        return v as string | undefined;
      }
      return [v.Alphabetic ?? "", v.Ideographic ?? "", v.Phonetic ?? ""]
        .join(pnDelim)
        .replace(new RegExp(`${pnDelim}*$`), "");
    })
    .join(String.fromCharCode(VM_DELIMITER));
}

/**
 * Overrides toJSON and toString to ensure JSON.stringify always returns
 * a valid dicom+json object, even when given a string such as "Doe^John".
 * @param value - value object which will be given the accessors. note
 *     for a string it must first be boxed: new String(value)
 * @returns the same object
 */
function pnAddValueAccessors<T extends object>(
  value: T
): T & ValueWithAccessors {
  const valueWithAccessors = value as T & ValueWithAccessors;
  if (!valueWithAccessors.__hasValueAccessors) {
    Object.defineProperty(valueWithAccessors, "__hasValueAccessors", {
      value: true,
    });
    Object.defineProperty(valueWithAccessors, "toJSON", {
      value: function (this: T) {
        if (Array.isArray(this)) {
          return this.filter(Boolean).map((x) =>
            pnStringToObject(x as PNInputValue, false)
          );
        } else {
          return pnStringToObject(this as unknown as PNInputValue);
        }
      },
    });
    // This override is mostly for testing; PN is always represented
    // by its dicom+json model, but serialization flattens it to a
    // part10 string.
    Object.defineProperty(valueWithAccessors, "toString", {
      value: function () {
        return pnObjectToString(value as unknown as PNInputValue);
      },
    });
  }
  return valueWithAccessors;
}

const dicomJson = {
  pnObjectToString: pnObjectToString,
  pnConvertToJsonObject: pnStringToObject,
  pnAddValueAccessors: pnAddValueAccessors,
};

export default dicomJson;
export type { PersonNameComponents, ValueWithAccessors };

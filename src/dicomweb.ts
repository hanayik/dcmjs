import log from "./log.js";

/** Supported DICOMweb endpoint types */
type EndpointType = "wado" | "patients" | "studies" | "series" | "instances";

/** Response types for different endpoints */
type ResponseType = "arraybuffer" | "json";

/** XMLHttpRequest response types based on responseType setting */
type XHRResponse = ArrayBuffer | object;

/** Parameters that can be passed to DICOMweb requests */
type RequestParameters = Record<string, string>;

/** Progress callback function type */
type ProgressCallback = ((this: XMLHttpRequest, ev: ProgressEvent) => void) | null;

/** Options for DICOMWEB constructor */
interface DICOMWEBOptions {
    rootURL?: string;
    progressCallback?: ProgressCallback;
}

/** DICOM JSON patient object */
interface DICOMPatient {
    [tag: string]: {
        vr: string;
        Value?: (string | number | object)[];
    };
}

/** DICOM JSON study object */
interface DICOMStudy {
    [tag: string]: {
        vr: string;
        Value?: (string | number | object)[];
    };
}

/** DICOM JSON series object */
interface DICOMSeries {
    [tag: string]: {
        vr: string;
        Value?: (string | number | object)[];
    };
}

/** DICOM JSON instance object */
interface DICOMInstance {
    [tag: string]: {
        vr: string;
        Value?: (string | number | object)[];
    };
}

class DICOMWEB {
    /*
    JavaScript DICOMweb REST API for browser use.

    Design:
    * map rest api to high-level code with modern conventions
    ** ES6: classes, arrow functions, let...
    ** promises
    ** json converted to objects

   examples: see tests() method below.

  */

    rootURL: string | undefined;
    progressCallback: ProgressCallback;

    constructor(options: DICOMWEBOptions = {}) {
        this.rootURL = options.rootURL;
        this.progressCallback = options.progressCallback ?? null;
    }

    static responseType(endpoint: EndpointType): ResponseType {
        const types: Partial<Record<EndpointType, ResponseType>> = {
            wado: "arraybuffer"
        };
        return types[endpoint] ? types[endpoint] : "json";
    }

    // which URL service to use for each of the high level services
    static endpointService(endpoint: EndpointType): string {
        const services: Partial<Record<EndpointType, string>> = {
            wado: ""
        };
        return Object.keys(services).indexOf(endpoint) != -1 ? (services[endpoint] as string) : "rs/";
    }

    static randomEntry<T>(array: T[]): T {
        return array[Math.floor(Math.random() * array.length)];
    }

    request(
        endpoint: EndpointType,
        parameters: RequestParameters = {},
        payload?: Document | XMLHttpRequestBodyInit | null
    ): Promise<XHRResponse> {
        const responseType = DICOMWEB.responseType(endpoint);
        const service = DICOMWEB.endpointService(endpoint);
        let url = this.rootURL + "/" + service + endpoint;
        let firstParameter = true;
        Object.keys(parameters).forEach((parameter) => {
            if (firstParameter) {
                url += "?";
                firstParameter = false;
            } else {
                url += "&";
            }
            url += parameter + "=" + encodeURIComponent(parameters[parameter]);
        });

        const promiseHandler = (
            resolve: (value: XHRResponse) => void,
            reject: (reason: ProgressEvent) => void
        ): void => {
            const request = new XMLHttpRequest();
            request.open("GET", url);
            request.responseType = responseType;
            request.onload = () => {
                resolve(request.response as XHRResponse);
            };
            request.onprogress = this.progressCallback;
            request.onerror = (error: ProgressEvent) => {
                log.error(request.response);
                reject(error);
            };
            request.send(payload);
        };

        const promise = new Promise<XHRResponse>(promiseHandler);
        return promise;
    }

    patients(): Promise<DICOMPatient[]> {
        return this.request("patients") as Promise<DICOMPatient[]>;
    }

    studies(patientID: string): Promise<DICOMStudy[]> {
        return this.request("studies", { PatientID: patientID }) as Promise<DICOMStudy[]>;
    }

    series(studyInstanceUID: string): Promise<DICOMSeries[]> {
        return this.request("series", {
            StudyInstanceUID: studyInstanceUID
        }) as Promise<DICOMSeries[]>;
    }

    instances(studyInstanceUID: string, seriesInstanceUID: string): Promise<DICOMInstance[]> {
        return this.request("instances", {
            StudyInstanceUID: studyInstanceUID,
            SeriesInstanceUID: seriesInstanceUID
        }) as Promise<DICOMInstance[]>;
    }

    instance(studyInstanceUID: string, seriesInstanceUID: string, sopInstanceUID: string): Promise<ArrayBuffer> {
        return this.request("wado", {
            requestType: "WADO",
            studyUID: studyInstanceUID,
            seriesUID: seriesInstanceUID,
            objectUID: sopInstanceUID,
            contentType: "application/dicom"
        }) as Promise<ArrayBuffer>;
    }

    tests(): void {
        const testingServerURL = "http://quantome.org:4242/dcm4chee-arc/aets/DCM4CHEE";
        const testOptions: DICOMWEBOptions = { rootURL: testingServerURL };

        void new DICOMWEB(testOptions).patients().then((responses) => {
            responses.forEach((patient) => {
                log.info(patient);
            });
        });
    }
}

export { DICOMWEB };
export type {
    DICOMWEBOptions,
    DICOMPatient,
    DICOMStudy,
    DICOMSeries,
    DICOMInstance,
    EndpointType,
    RequestParameters,
    ProgressCallback
};

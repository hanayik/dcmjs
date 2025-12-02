export interface MeasurementContentItem {
    GraphicData: number[];
    GraphicType?: string;
    [key: string]: unknown;
}

export interface Point3D {
    0: number;
    1: number;
    2: number;
}

export interface Scoord3d {
    graphicType: string;
    graphicData: Point3D[] | Point3D;
}

export interface TID300RepresentationArguments {
    points: Point3D[] | Point3D;
    lengths: number;
}

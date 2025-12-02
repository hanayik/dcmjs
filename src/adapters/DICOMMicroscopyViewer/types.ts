export interface MeasurementContentItem {
    GraphicData: number[];
    GraphicType?: string;
    [key: string]: unknown;
}

/** 3D point as a mutable array [x, y, z] or [x, y] */
export type Point3D = number[];

export interface Scoord3d {
    graphicType: string;
    graphicData: Point3D[] | Point3D;
}

export interface TID300RepresentationArguments {
    points: Point3D[] | Point3D;
    lengths: number;
    [key: string]: unknown;
}

/** DevLens data contracts (content script -> extension UI). */

export interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface NodeRef {
  tag: string;
  id?: string;
  classes: string[];
  selector: string;
}

export interface ElementInspection {
  selector: string;
  tag: string;
  id?: string;
  classes: string[];
  rect: { x: number; y: number; width: number; height: number };
  margin: Box;
  padding: Box;
  border: Box;
  /** Curated computed style properties (property -> value). */
  styles: Record<string, string>;
  typography: {
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    lineHeight: string;
    letterSpacing: string;
    color: string;
  };
  parents: NodeRef[];
  children: NodeRef[];
  childCount: number;
  /** Attribute names (+ values for safe attributes like href/src/alt/role/aria-*), truncated. */
  attributes: { name: string; value: string }[];
}

export interface ColorSwatch {
  hex: string;
  rgb: string;
  hsl: string;
  alpha: number;
  count: number;
  usages: ('text' | 'background' | 'border')[];
}

export interface TypographyStyle {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  count: number;
  /** First tag observed using this combination, e.g. "h1". */
  sampleTag: string;
}

export interface TypographyReport {
  styles: TypographyStyle[];
  /** Font faces from document.fonts with status. */
  fontFaces: { family: string; weight: string; style: string; status: string }[];
}

export interface AssetItem {
  kind: 'image' | 'background-image' | 'svg-inline' | 'font' | 'icon' | 'video-poster';
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface ViewportInfo {
  innerWidth: number;
  innerHeight: number;
  outerWidth: number;
  outerHeight: number;
  devicePixelRatio: number;
}

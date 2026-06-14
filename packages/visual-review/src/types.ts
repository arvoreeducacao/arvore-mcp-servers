export interface RouteInfo {
  route: string;
  url: string;
  files: string[];
}

export interface FigmaFrame {
  nodeId: string;
  name: string;
  width: number;
  height: number;
  imageUrl: string;
}

export interface ReviewSession {
  id: string;
  repoPath: string;
  baseUrl: string;
  accessToken: string;
  routes: RouteInfo[];
  port: number;
  figmaApiKey?: string;
}

export interface DiffResult {
  totalPixels: number;
  differentPixels: number;
  diffPercentage: number;
  diffImageBuffer: Buffer;
}

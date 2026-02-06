
export interface ReferenceImage {
  id: string;
  file?: File;
  base64: string;
  x: number;
  y: number;
  width: number;
  height: number;
  score?: number;
  isGenerating?: boolean;
  synthesisData?: {
    prompt: string;
    sources: {
      thumbnail: string;
      contribution: number;
    }[];
  };
}

export interface SynthesisResult {
  prompt: string;
  imageUrl: string;
}

export type ImageModel = 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview' | 'imagen-4.0-generate-001';
export type AspectRatio = '1:1' | '4:3' | '16:9' | '9:16';

export interface AppSettings {
  model: ImageModel;
  aspectRatio: AspectRatio;
  influenceRadius: number;
}

export interface BoardState {
  images: ReferenceImage[];
  settings: AppSettings;
}

export interface SavedBoard {
  id: string;
  name: string;
  timestamp: number;
  state: BoardState;
}

export enum LoadingStep {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export const calculateBaseSizeScore = (width: number, height: number): number => {
  const area = width * height;
  return Math.min(5, Math.max(1, area / 40000));
};

export const calculateProximityWeight = (
  imgX: number, 
  imgY: number, 
  imgW: number, 
  imgH: number, 
  targetX: number, 
  targetY: number,
  radius: number
): number => {
  const centerX = imgX + imgW / 2;
  const centerY = imgY + imgH / 2;
  const dist = Math.sqrt(Math.pow(centerX - targetX, 2) + Math.pow(centerY - targetY, 2));
  if (dist > radius) return 0;
  return 1 - (dist / radius);
};

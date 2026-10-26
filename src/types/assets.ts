import type * as THREE from 'three';
export type ModelDetail = 'high' | 'low';
export interface NativePart { geometry: THREE.BufferGeometry; material: THREE.MeshLambertMaterial; matrix: THREE.Matrix4 }
export interface NativeTransport { url: string; rawUrl: string; sourceBytes: number; compressedBytes: number }
export interface ModelTiming { [metric: string]: string | number | undefined }
export interface StartupDiagnostics { enabled: boolean; stages: Record<string, number>; models: ModelTiming[]; workerCount?: number }
export interface NativeProgram { format: string; [extension: string]: unknown }
export interface EncodedAttribute { array: THREE.TypedArray; itemSize: number; normalized: boolean }
export interface WorkerPart { attributes: Record<string, EncodedAttribute>; index?: Uint16Array | Uint32Array; material: THREE.MeshLambertMaterialParameters }
export interface ModelJob { url: string; measure: boolean }
export interface ModelResult { parts: WorkerPart[]; timing?: ModelTiming; workerIndex: number }
export interface WorkerResponse { id: number; parts: WorkerPart[]; timing?: ModelTiming; error?: string }

import type {Area, Point, Pose, PlayerMode, Scenario, VehicleSpec, DrivingSpec} from './scenario.ts';
export interface RouteReference { event: string; vehicle: number; from?: number; to?: number; points?: Point[] }
export interface FlowSource { id: string; name?: string; route: RouteReference[]; repeat: number[]; speedKmh?: number; delay?: number }
export interface CandidateSource { vehicle: number; flow?: string; slot?: string; prefix?: string; anchor?: 'participant' | Point }
export interface BindingSource { id: string; group?: string; modes?: PlayerMode[]; zone: Area; heading?: number; headingTolerance?: number; requires?: string; candidates: CandidateSource[]; chance?: number; cooldown?: number }
export interface RedEntryPolicy { flows: string[]; speedKmh: number; reactionTimeSeconds: number; maxBrakingMps2: number; maxVehicles: number; cooldownSeconds: number; timeoutSeconds: number }
export interface HiddenAdmission { farMeters: number; nearMeters: number; viewHalfAngle: number; stopLineMargin: number; searchMeters: number }
export interface WorldManifest { format: string; version: number; id: string; map: string; starts: Record<PlayerMode, Pose>; recovery?: Point[]; maxCars?: number; hiddenAdmission?: Partial<HiddenAdmission>; noAdmission?: Area[]; encounterChance?: number; flows?: FlowSource[]; events?: BindingSource[]; props?: {parked?: ParkedPlacement[]; slots?: {id: string; event: string; vehicle: number}[]}; redEntryResponse?: RedEntryPolicy | null }
export type Candidate = {kind: 'flow' | 'route'; anchor: Point | 'participant'; slot?: never; spec: DrivingSpec} | {kind: 'slot'; slot: string; anchor?: never; spec: DrivingSpec};
export interface Binding extends Pick<Scenario, 'name' | 'nameEn' | 'learningGoal' | 'point' | 'situation' | 'setting'> {id: string; group: string; modes: PlayerMode[]; zone: Area; heading: number | null; headingTolerance: number; requires: string | null; candidates: Candidate[]; chance: number; cooldown: number }
export interface WorldSlot extends Pose {id: string}
export interface ResolvedWorld {id: string; map: string; starts: Record<PlayerMode, Pose>; recovery: Point[]; maxCars: number; hidden: HiddenAdmission; noAdmission: Area[]; parked: ParkedPlacement[]; slots: Map<string, WorldSlot>; flows: (VehicleSpec & {id: string})[]; events: Binding[]; redEntryResponse: RedEntryPolicy | null}
export interface ParkedPlacement extends Pose {kind: string; model?: string; source?: string}
export type EncounterOutcome = 'contact' | 'near-miss' | 'yielded' | 'passed' | 'deferred' | 'left';
export interface EncounterRecord {instance: string; event: string; outcome: EncounterOutcome; time: number; duration: number; minGap: number | null; cars: number[]; behaviors: string[]; violations: (string | null)[]}

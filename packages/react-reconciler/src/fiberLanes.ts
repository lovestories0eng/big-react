import { FiberRootNode } from './fiber';

export type Lane = number;
export type Lanes = number;

export const SyncLane = 0b0001;
export const NoLane = 0b0000;
export const NoLanes = 0b0000;

export const XXXLane = 0b0010;

export function mergeLanes(laneA: Lane, laneB: Lane): Lanes {
	return laneA | laneB;
}

export function requestUpdateLanes() {
	return SyncLane;
}

export function getHighestPriorityLane(lanes: Lanes): Lane {
	// (补码): 0b00010101 & -0b00010101 = 0b00010101 & 0b11101011 = 0b00000001
	return lanes & -lanes;
}

export function markRootFinished(root: FiberRootNode, lane: Lane) {
	root.pendingLanes &= ~lane;
}

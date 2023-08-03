export type Flags = number;

export const NoFlags = 0b0000000; // 0
export const Placement = 0b0000001; // 1
export const Update = 0b0000010; // 2
export const ChildDeletion = 0b0000100; // 4

export const PassiveEffect = 0b0001000; // 8

export const Ref = 0b0010000; // 16
export const Visibility = 0b0100000; // 32

/** 是否需要执行 mutation 阶段 */
export const MutationMask =
	Placement | Update | ChildDeletion | Ref | Visibility;
export const LayoutMask = Ref;

export const PassiveMask = PassiveEffect | ChildDeletion;

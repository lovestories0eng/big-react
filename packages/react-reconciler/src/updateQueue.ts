import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';
import { Lane, NoLane, isSubsetOfLanes } from './fiberLanes';

export interface Update<State> {
	action: Action<State>;
	lane: Lane;
	next: Update<any> | null;
}

export interface UpdateQueue<State> {
	shared: {
		pending: Update<State> | null;
	};
	dispatch: Dispatch<State> | null;
}

// 创建更新
export const createUpdate = <State>(
	action: Action<State>,
	lane: Lane
): Update<State> => {
	// 由于初始化的时候传入的是ReactElement（<App/>）
	// 所以返回的是App对应的ReactElement对象
	return {
		action,
		lane,
		next: null
	};
};

// 初始化 updateQueue
export const createUpdateQueue = <State>() => {
	return {
		shared: {
			pending: null
		},
		dispatch: null
	} as UpdateQueue<State>;
};

// 将更新推进队列
export const enqueueUpdate = <State>(
	// 更新队列的引用
	updateQueue: UpdateQueue<State>,
	// 新增的队列
	update: Update<State>
) => {
	const pending = updateQueue.shared.pending;
	if (pending === null) {
		// pending = a -> a
		update.next = update;
	} else {
		// b.next = a.next
		update.next = pending.next;
		// a.next = b
		pending.next = update;
	}
	// render <App />时，得到了更新队列。其实是一个ReactElement组件。（我们调用render传入的jsx）
	// pending = b -> a -> b
	updateQueue.shared.pending = update;
	// c.next = b.next
	// b.next = c
	// pending = c -> a -> b -> c
};

export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null,
	renderLane: Lane
): {
	memoizedState: State;
	baseState: State;
	baseQueue: Update<State> | null;
} => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState,
		baseState,
		baseQueue: null
	};
	if (pendingUpdate !== null) {
		// 第一个 update
		const first = pendingUpdate.next;
		let pending = pendingUpdate.next as Update<any>;

		let newBaseState = baseState;
		let newState = baseState;
		let newBaseQueueFirst: Update<State> | null = null;
		let newBaseQueueLast: Update<State> | null = null;

		do {
			const updateLane = pending.lane;
			if (!isSubsetOfLanes(renderLane, updateLane)) {
				// 优先级不够 被跳过
				const clone = createUpdate(pending.action, pending.lane);
				// 是不是第一个被跳过的
				if (newBaseQueueFirst === null) {
					// first u0 last u0
					newBaseQueueFirst = clone;
					newBaseQueueLast = clone;
					newBaseState = newState;
				} else {
					// first u0 -> u1
					// last u1 u0 -> u1
					// last u1 -> u2
					// last u2 u1 -> u2
					// first u0 -> u1 -> u2
					// last u2 -> u0 -> u1 -> u2
					// 在尾部插入新的更新需求
					(newBaseQueueLast as Update<State>).next = clone;
					newBaseQueueLast = clone;
				}
			} else {
				// 如果存在更新要被跳过
				if (newBaseQueueLast !== null) {
					// 以被跳过的更新为首指针创建一个链表
					const clone = createUpdate(pending.action, NoLane);
					(newBaseQueueLast as Update<State>).next = clone;
					newBaseQueueLast = clone;
				}

				// 优先级足够
				// 如果有多个更新，则后面的更新会覆盖前面的更新
				const action = pending.action;
				if (action instanceof Function) {
					newState = action(baseState);
				} else {
					newState = action;
				}
			}
			pending = pending.next as Update<any>;
		} while (pending !== first);
		if (newBaseQueueLast === null) {
			// 本次计算没有 update 被跳过，则这个 state 一定是最新的那个 state
			newBaseState = newState;
		} else {
			// 首尾相连，形成环状链表
			newBaseQueueLast.next = newBaseQueueFirst;
		}
		// 优先级足够的 state
		result.memoizedState = newState;
		// 优先级不够的 state
		result.baseState = newBaseState;
		// 指向队列最后一个元素，因为 newBaseQueueLast.next 为第一个元素
		result.baseQueue = newBaseQueueLast;
	}
	return result;
};

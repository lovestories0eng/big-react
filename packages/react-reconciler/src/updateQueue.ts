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

/**
 * 处理更新队列，计算最终值
 * 兼顾更新的连续性与更新的优先级
 * 高优先级任务打断低优先级任务之后，不以低优先级任务计算得到的 baseState 做计算
 * 低优先级任务重启后，不能覆盖高优先级任务计算得到的值
 * 且需要根据低优先级任务计算得到的 newState，作为高优先级的 baseState 再去执行一次高优先级任务
 */
export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null,
	renderLane: Lane
): {
	// 上次更新计算的最终 state
	memoizedState: State;
	// 本次更新参与计算的初始 state
	baseState: State;
	baseQueue: Update<State> | null;
} => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState,
		baseState,
		baseQueue: null
	};
	if (pendingUpdate !== null) {
		// 第一个 update，由于首指针指向的是循环链表的最后一个元素，因此要取 next。
		const first = pendingUpdate.next;
		let pending = pendingUpdate.next as Update<any>;

		let newBaseState = baseState;
		let newState = baseState;
		let newBaseQueueFirst: Update<State> | null = null;
		let newBaseQueueLast: Update<State> | null = null;

		do {
			const updateLane = pending.lane;
			if (!isSubsetOfLanes(renderLane, updateLane)) {
				// 优先级不够，被跳过
				const clone = createUpdate(pending.action, pending.lane);
				if (newBaseQueueFirst === null) {
					// first u0 last u0
					newBaseQueueFirst = clone;
					newBaseQueueLast = clone;
					// newBaseState 被赋值为 上一次计算出的 newState
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
				// 优先级足够
				// 如果存在更新被跳过的情况
				if (newBaseQueueLast !== null) {
					/**
					 * 以被跳过的更新为首指针创建一个链表
					 * 前面已有更新被跳过，但依然参与计算，优先级变为 NoLane，这样一定会参与下一次的计算
					 */
					const clone = createUpdate(pending.action, NoLane);
					(newBaseQueueLast as Update<State>).next = clone;
					newBaseQueueLast = clone;
				}

				// 如果有多个更新，则后面的更新会覆盖前面的更新
				const action = pending.action;
				if (action instanceof Function) {
					/**
					 * 例如: setNum(num => num + 1)
					 * 这里的 num 是形参，最终的实参是 baseState
					 */
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

/**
 * {
 *   action: (num) => num + 1,
 *   lane: DefaultLane
 * },
 * {
 *   action: 3,
 *   lane: SyncLane
 * },
 * {
 *   action: (num) => num + 10,
 *   lane: DefaultLane
 * }
 */

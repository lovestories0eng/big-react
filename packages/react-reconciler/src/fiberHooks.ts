import internals from 'shared/internals';
import { FiberNode } from './fiber';
import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import currentBatchConfig from 'react/src/currentBatchConfig';
import {
	UpdateQueue,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue,
	Update
} from './updateQueue';
import { Action, ReactContext } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';
import { Lane, NoLane, requestUpdateLanes } from './fiberLanes';
import { Flags, PassiveEffect } from './fiberFlags';
import { HookHasEffect, Passive } from './hookEffectTags';

// 正在 render 的函数组件，即 workInProgress
let currentlyRenderingFiber: FiberNode | null = null;
// 链表结构，把所有的 Hooks 串到一个链表上面
let workInProgressHook: Hook | null = null;
let currentHook: Hook | null = null;
// 当前函数组件 render 的优先级
let renderLane: Lane = NoLane;

const { currentDispatcher } = internals;

interface Hook {
	/**
	 * Hook 中的 memoizedState 指的是 setState 中的参数
	 * 同时也是在下一次更新前所存储的之前状态数据
	 */
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
	baseState: any;
	baseQueue: Update<any> | null;
}

export interface Effect {
	tag: Flags;
	create: EffectCallback | void;
	destroy: EffectCallback | void;
	deps: EffectDeps;
	next: Effect | null;
}

export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	lastEffect: Effect | null;
}

type EffectCallback = () => void;
type EffectDeps = any[] | null;

export function renderWithHooks(wip: FiberNode, lane: Lane) {
	// 赋值操作
	currentlyRenderingFiber = wip;
	// 重置 hooks 链表
	wip.memoizedState = null;
	// 重置 effect 链表
	wip.updateQueue = null;
	// 为全局变量 renderLane 赋值
	renderLane = lane;

	// 双缓存机制，拿到已经渲染到浏览器中的 FiberNode
	const current = wip.alternate;
	if (current !== null) {
		// update
		currentDispatcher.current = HooksDispatcherOnUpdate;
	} else {
		// mount
		currentDispatcher.current = HooksDispatcherOnMount;
	}

	// 这里的属性在 createFiberFormElement 中得到
	const Component = wip.type;
	const props = wip.pendingProps;
	// 执行函数，得到 JSX 对象
	const children = Component(props);

	// 重置操作
	currentlyRenderingFiber = null;
	workInProgressHook = null;
	currentHook = null;
	renderLane = NoLane;
	return children;
}

const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState,
	useEffect: mountEffect,
	useTransition: mountTransition,
	useRef: mountRef,
	useContext: readContext
};

const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect,
	useTransition: updateTransition,
	useRef: updateRef,
	useContext: readContext
};

/**
 * useRef使用 ref = useRef(null)
 * @param initialValue
 * @returns
 */
function mountRef<T>(initialValue: T): { current: T } {
	const hook = mountWorkInProgressHook();
	const ref = { current: initialValue };
	hook.memoizedState = ref;
	return ref;
}

function updateRef<T>(initialValue: T): { current: T } {
	const hook = updateWorkInProgressHook();
	console.log('--updateRef--updateRef', hook);
	return hook.memoizedState;
}

function mountEffect(create: EffectCallback | void, deps: EffectDeps | void) {
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;

	hook.memoizedState = pushEffect(
		Passive | HookHasEffect,
		create,
		undefined,
		nextDeps
	);
}

function updateEffect(create: EffectCallback | void, deps: EffectDeps | void) {
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	let destroy: EffectCallback | void;

	if (currentHook !== null) {
		const prevEffect = currentHook.memoizedState as Effect;
		destroy = prevEffect.destroy;

		if (nextDeps !== null) {
			// 浅比较依赖
			const prevDeps = prevEffect.deps;
			if (areHookInputEqual(nextDeps, prevDeps)) {
				hook.memoizedState = pushEffect(Passive, create, destroy, nextDeps);
				return;
			}
		}
		// 浅比较 不相等
		(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;
		hook.memoizedState = pushEffect(
			Passive | HookHasEffect,
			create,
			destroy,
			nextDeps
		);
	}
}

function areHookInputEqual(nextDeps: EffectDeps, prevDeps: EffectDeps) {
	if (prevDeps === null || nextDeps === null) {
		return false;
	}
	for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
		if (Object.is(prevDeps[i], nextDeps[i])) {
			continue;
		}
		return false;
	}

	return true;
}

function pushEffect(
	hookFlags: Flags,
	create: EffectCallback | void,
	destroy: EffectCallback | void,
	deps: EffectDeps
): Effect {
	const effect: Effect = {
		tag: hookFlags,
		create,
		destroy,
		deps,
		next: null
	};
	const fiber = currentlyRenderingFiber as FiberNode;
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	if (updateQueue === null) {
		const updateQueue = createFCUpdateQueue();
		fiber.updateQueue = updateQueue;
		effect.next = effect;
		updateQueue.lastEffect = effect;
	} else {
		// 插入effect
		const lastEffect = updateQueue.lastEffect;
		if (lastEffect === null) {
			effect.next = effect;
			updateQueue.lastEffect = effect;
		} else {
			const firstEffect = lastEffect.next;
			lastEffect.next = effect;
			effect.next = firstEffect;
			updateQueue.lastEffect = effect;
		}
	}

	return effect;
}

function createFCUpdateQueue<State>() {
	const updateQueue = createUpdateQueue<State>() as FCUpdateQueue<State>;
	updateQueue.lastEffect = null;
	return updateQueue;
}

// 在函数组件更新时执行
function updateState<State>(): [State, Dispatch<State>] {
	const hook = updateWorkInProgressHook();

	// 计算新 state 的逻辑
	const queue = hook.updateQueue as UpdateQueue<State>;
	const baseState = hook.baseState;

	const pending = queue.shared.pending;
	// 在 updateWorkInProgress 中有给 currentHook 赋值
	const current = currentHook as Hook;
	let baseQueue = current.baseQueue;
	if (pending !== null) {
		/**
		 * pending baseQueue update 保存在 current 中
		 * baseQueue 一开始赋值为 null
		 * 由于有其他优先级更高的任务存在，可能导致当前的 baseQueue 没有更新完因而不为 null
		 * 优先级不同，多次调用 processUpdateQueue
		 */
		if (baseQueue !== null) {
			// 合并 baseQueue 与 pendingQueue
			// baseQueue b2 -> b0 -> b1 -> b2
			// pendingQueue p2 -> p0 -> p1 -> p2
			// b0
			const baseFirst = baseQueue.next;
			// p0
			const pendingFirst = pending.next;
			// b2 -> p0
			baseQueue.next = pendingFirst;
			// p2 -> b0
			pending.next = baseFirst;
			// p2 -> b0 -> b1 -> b2 -> p0 -> p1 -> p2
		}

		baseQueue = pending;
		// 保存在 current 中
		current.baseQueue = pending;
		// 回收空间，防止内存泄漏
		queue.shared.pending = null;
	}

	if (baseQueue !== null) {
		const {
			memoizedState,
			baseQueue: newBaseQueue,
			baseState: newBaseState
		} = processUpdateQueue(baseState, baseQueue, renderLane);
		// 拿到计算完的 memoizedState
		hook.memoizedState = memoizedState;
		hook.baseState = newBaseState;
		hook.baseQueue = newBaseQueue;
	}

	/**
	 * 这里的 queue.dispatch 本质上就是 disPatchSetState
	 * 返回的 hook.memoizedState，是上次任务 setState 后计算出来的新的 state
	 */
	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

// 该函数在 useState 时执行
function mountState<State>(
	initialState: (() => State) | State
): [State, Dispatch<State>] {
	/**
	 * 创建当前 useState 对应的 hook 数据
	 * 这里将 currentlyRenderingFiber.memoizedState 的值赋为了当前 React Hook 对应的更新链表的首指针
	 */
	const hook = mountWorkInProgressHook();

	let memoizedState;
	// 记录 mount 时传入的 state
	if (initialState instanceof Function) {
		memoizedState = initialState();
	} else {
		memoizedState = initialState;
	}

	// 在 mount 时创建一条新的更新队列
	const queue = createUpdateQueue<State>();
	// 更新队列
	hook.updateQueue = queue;
	// 这里的 memoizedState 为 setState 的参数
	hook.memoizedState = memoizedState;
	// 这里是初始时 useState 的参数
	hook.baseState = memoizedState;

	/**
	 * 将 dispatchSetState 绑定到 useState 返回的结果中，在 updateState 时可以进行相关的调用
	 * 这里将 dispatchSetState 与 currentlyRenderingFiber 与 queue 绑定，确保其后续能够获得更新队列
	 */
	// @ts-ignore
	const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
	queue.dispatch = dispatch;

	return [memoizedState, dispatch];
}

function dispatchSetState<State>(
	// 这里的 Fiber 是函数组件
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	const lane = requestUpdateLanes();
	// 创建一个新的更新需求，这里如果有多个 setState，最终只会执行一次 setState
	// 同步优先级使用微任务调度，因此多个 setState 只有最后一个是生效的
	const update = createUpdate(action, lane);

	// 把更新需求压入队列
	enqueueUpdate(updateQueue, update);
	// 重新进行调度，这里的 fiber 为 currentlyRenderingFiber，即正在 render 的函数组件
	scheduleUpdateOnFiber(fiber, lane);
}

function updateWorkInProgressHook(): Hook {
	// render 阶段触发的更新
	let nextCurrentHook: Hook | null;
	if (currentHook === null) {
		/**
		 * 这是 FC update 时的第一个 hook
		 * currentlyRenderingFier 代表当前的 workInProgress
		 * currentlyRenderingFiber.alternate 代表已经渲染到浏览器上面的函数组件，即 renderWithHooks 的 current
		 */
		const current = (currentlyRenderingFiber as FiberNode).alternate;
		if (current !== null) {
			/**
			 * update
			 * 这里其实就是拿到 dispatchSetState 的更新队列
			 */
			nextCurrentHook = current.memoizedState;
		} else {
			/**
			 * current === null，则代表函数组件第一次 mount
			 * 但由于这是 updateWorkInProgressHook，因此 current 不应该也不可能等于 null
			 */
			nextCurrentHook = null;
		}
	} else {
		// 这个 FC update 时 后续的hook
		nextCurrentHook = currentHook.next;
	}

	if (nextCurrentHook === null) {
		// mount/update u1 u2 u3
		// update       u1 u2 u3 u4
		throw new Error(
			`组件${currentlyRenderingFiber?.type}本次执行时的Hook比上次执行多`
		);
	}

	// currentHook = currentHook.next
	currentHook = nextCurrentHook as Hook;
	const newHook = {
		memoizedState: currentHook.memoizedState,
		updateQueue: currentHook.updateQueue,
		next: null,
		baseQueue: currentHook.baseQueue,
		baseState: currentHook.baseState
	};

	if (workInProgressHook === null) {
		// update 时 第一个 hook
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = newHook;
			// currentlyRenderingFiber 指向 第一个 hook
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// update 时 后续的 hook
		workInProgressHook.next = newHook;
		workInProgressHook = newHook;
	}

	return workInProgressHook;
}

function mountTransition(): [boolean, (callback: () => void) => void] {
	const [isPending, setIsPending] = mountState(false);
	const hook = mountWorkInProgressHook();
	const start = startTransition.bind(null, setIsPending);
	hook.memoizedState = start;

	return [isPending, start];
}

function updateTransition(): [boolean, (callback: () => void) => void] {
	const [isPending] = updateState();
	const hook = updateWorkInProgressHook();
	const start = hook.memoizedState;
	return [isPending as boolean, start];
}

function startTransition(setPending: Dispatch<boolean>, callback: () => void) {
	setPending(true);
	const prevTransition = currentBatchConfig.transition;
	currentBatchConfig.transition = 1;

	callback();
	setPending(false);

	currentBatchConfig.transition = prevTransition;
}

/**
 * hook: 代表一个 React Hook
 * updateQueue: 代表一个更新队列，比如在一个同步任务中对此 setState
 * hook 是一个链表，串联起一个个 React Hook
 * 同时 updateQueue 也是链表，串联起在同步任务中多次进行的 setState
 */
function mountWorkInProgressHook(): Hook {
	// 创建一个新的 hook
	const hook: Hook = {
		memoizedState: null,
		updateQueue: null,
		next: null,
		baseQueue: null,
		baseState: null
	};

	// mount时 第一个hook
	if (workInProgressHook === null) {
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = hook;
			/**
			 * 把当前的第一个 hook 赋值到 currentlyRenderingFiber.memoizedState 上
			 * 如果多次进行 setState 操作，则 currentlyRenderingFiber.memoizedState 最终会成为一条循环链表
			 * 这样就将一个函数组件中用到的多个 React Hook 串联有序执行
			 */
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		/**
		 * mount 时后续的 hook，创建出一个链表
		 * workInProgreeHook 指向链表的最后一个元素
		 */
		workInProgressHook.next = hook;
		workInProgressHook = hook;
	}

	return workInProgressHook;
}

function readContext<T>(context: ReactContext<T>) {
	const consumer = currentlyRenderingFiber;
	if (consumer === null) {
		throw new Error('context需要有consumer');
	}
	const value = context._currentValue;
	return value;
}

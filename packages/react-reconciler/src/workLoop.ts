import { beginWork } from './beginWork';
import { completeWork } from './completeWork';
import {
	FiberNode,
	FiberRootNode,
	PendingPassiveEffects,
	createWorkInProgress
} from './fiber';
import { MutationMask, NoFlags, PassiveMask } from './fiberFlags';
import { HostRoot } from './workTags';
import {
	commitHookEffectListCreate,
	commitHookEffectListDestroy,
	commitHookEffectListUnmount,
	commitLayoutEffects,
	commitMutationEffects
} from './commitWork';
import {
	Lane,
	NoLane,
	SyncLane,
	getHighestPriorityLane,
	lanesToSchedulerPriority,
	markRootFinished,
	mergeLanes
} from './fiberLanes';

import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority,
	unstable_shouldYield,
	unstable_cancelCallback
} from 'scheduler';

import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { scheduleMicroTask } from 'hostConfig';
import { HookHasEffect, Passive } from './hookEffectTags';

// 正在内存中构建的 Fiber 树，表示当前正在调和的 fiber 节点，之后简称 wip
let workInProgress: FiberNode | null = null;
let wipRootRenderLane: Lane = NoLane;
let rootDoesHasPassiveEffect = false;

type RootExitStatus = number;
const RootInComplete = 1;
const RootCompleted = 2;
// TODO 执行过程中报错了

// 初始化，将workInProgress 指向第一个fiberNode
function prepareFreshStack(root: FiberRootNode, lane: Lane) {
	// 初始化优先级为 0
	root.finishedLane = NoLane;
	root.finishedWork = null;
	/**
	 * 初始化 workInProgress 工作单元: workInProgress = roor.current.alternate
	 * 在更新时，workInProgress 重新指向 root.current.alternate
	 * 需要注意 此时 root.current.alternate 其实就是最初的 workInProgress
	 * 工作单元 workInProgress 会来回切换，用于进行 diff
	 */
	workInProgress = createWorkInProgress(root.current, {});
	wipRootRenderLane = lane;
}

export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	/**
	 * 每次 schedule 时都要找到 FiberRootNode
	 * 同步任务中同优先级会被合并成一个任务
	 */
	const root = markUpdateFormFiberToRoot(fiber);
	// 把 lane 优先级合并到 root.pendingLanes
	markRootUpdated(root, lane);
	// 开始调度
	ensureRootIsScheduled(root);
}

// schedule 入口
function ensureRootIsScheduled(root: FiberRootNode) {
	/**
	 * 找到当前优先级最高的 lane
	 * 该 lane 在之后会通过 lanesToSchedulerPriority 变成 priority 通过 scheduler 调度
	 */
	const updateLane = getHighestPriorityLane(root.pendingLanes);
	const existingCallback = root.callbackNode;

	if (updateLane === NoLane) {
		// 如果渲染优先级为空，则不需要调度
		if (existingCallback !== null) {
			unstable_cancelCallback(existingCallback);
		}
		// 清空 callbackNode 和 callbackPriority
		root.callbackNode = null;
		root.callbackPriority = NoLane;
		return;
	}

	const curPriority = updateLane;
	const prevPriority = root.callbackPriority;

	/**
	 * 节流(
	 * 	判断条件:
	 * 		curPriority === prevPriority,
	 * 		新旧更新的优先级相同, 如连续多次执行setState
	 * 	), 则无需注册新task(继续沿用上一个优先级相同的task), 直接退出调用.
	 * 	如果相等，此次更新合并到当前正在进行的任务中。
	 *  如果不相等，代表此次更新任务的优先级更高，需要打断当前正在进行的任务
	 */
	if (curPriority === prevPriority) {
		return;
	}

	// 新任务的 lane 优先级比较高，取消掉旧任务，实现高优先级任务插队
	if (existingCallback !== null) {
		unstable_cancelCallback(existingCallback);
	}

	let newCallbackNode = null;
	if (__DEV__) {
		console.log(
			`在${updateLane === SyncLane ? '微' : '宏'}微任务中调度，优先级：`,
			updateLane
		);
	}

	if (updateLane === SyncLane) {
		// 同步优先级 用微任务调度
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root));
		scheduleMicroTask(flushSyncCallbacks);
	} else {
		const schedulerPriority = lanesToSchedulerPriority(updateLane);
		// 其他优先级，用宏任务调度
		// 也就是在 workLoop 里通过 shouldYield 的判断来打断渲染，之后把剩下的节点加入 Schedule 调度，来恢复渲染。
		// 这里 performConcurrentWorkOnRoot 不会被真正地执行
		newCallbackNode = scheduleCallback(
			schedulerPriority,
			// @ts-ignore
			performConcurrentWorkOnRoot.bind(null, root)
		);
	}
	/**
	 * 挂载到root节点的callbackNode属性上，以表示当前已经有任务被调度了，
	 * 同时会将任务优先级存储到root的callbackPriority上，
	 * 表示如果有新的任务进来，必须用它的任务优先级和已有任务的优先级（root.callbackPriority）比较，
	 * 来决定是否有必要取消已经有的任务。
	 * 由于前面已经做了判断，因此这里的 curPriority 一定是最高的优先级
	 */
	root.callbackNode = newCallbackNode;
	root.callbackPriority = curPriority;
}

function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}

// scheduleUpdateOnFiber 主要是找到 hostFiberNode, 然后开始 reconciler 过程
function markUpdateFormFiberToRoot(fiber: FiberNode) {
	let node = fiber;
	let parent = node.return;
	while (parent !== null) {
		node = parent;
		parent = node.return;
	}
	if (node.tag === HostRoot) {
		return node.stateNode;
	}
	return null;
}

/**
 * 在React的concurrent模式下，低优先级任务执行过程中，
 * 一旦有更高优先级的任务进来，那么这个低优先级的任务会被取消，
 * 优先执行高优先级任务。等高优先级任务做完了，低优先级任务会被重新做一遍。
 * https://juejin.cn/post/6923792712197996557
 */
function performConcurrentWorkOnRoot(
	root: FiberRootNode,
	didTimeout: boolean
): any {
	// 保证useEffect回调执行
	const curCallback = root.callbackNode;
	const didFlushPassiveEffect = flushPassiveEffects(root.pendingPassiveEffects);
	if (didFlushPassiveEffect) {
		// 如果已经在 root.callbackNode 变过了
		if (root.callbackNode !== curCallback) {
			return null;
		}
	}

	const lane = getHighestPriorityLane(root.pendingLanes);
	const curCallbackNode = root.callbackNode;
	if (lane === NoLane) {
		return null;
	}
	// didTimeout 表示该任务在任务队列中的时间过长
	const needSync = lane === SyncLane || didTimeout;
	// render 阶段，会通过 shouldYield 提前中断
	const exitStatus: RootExitStatus = renderRoot(root, lane, !needSync);

	// 再进行一次调度，如果此时有不同优先级的任务则会更改 root.callbackNode
	ensureRootIsScheduled(root);

	if (exitStatus === RootInComplete) {
		// 中断，如果已经在 root.callbackNode 变过了，说明有更高优先级的任务，则直接终止当前任务
		if (root.callbackNode !== curCallbackNode) {
			return null;
		}
		/**
		 * You might wonder if a task is interrupted by shouldYield(),
		 * how would it resume? Yes, this is the answer.
		 * Scheduler looks at the return value of task callback to see if there is continuation,
		 * the return value is kind of rescheduling.
		 */
		/**
		 * react 的并发模式的打断只会根据时间片，也就是每 5ms 就打断一次
		 * 并不会根据优先级来打断，优先级只会影响任务队列的任务排序
		 */
		return performConcurrentWorkOnRoot.bind(null, root);
	}
	// render 阶段结束后进行 commit
	if (exitStatus === RootCompleted) {
		if (exitStatus === RootCompleted) {
			// 使用双缓存机制，更新 root.current.alternate 而不直接更新 root.current
			// 由 prepareFreshStack 可知，root.current.alternate 即为一开始的 workInProgress
			const finishedWork = root.current.alternate;
			root.finishedWork = finishedWork;
			root.finishedLane = lane;
			wipRootRenderLane = NoLane;

			/**
			 * 如果这里是高优先级任务之前抢断了低优先级任务
			 * 则会把高优先级任务以及之前部分执行的低优先级任务进行 commit
			 */
			// wip fiberNode 树中的flags
			commitRoot(root);
		} else if (__DEV__) {
			console.error('还未实现的并发更新结束状态');
		}
	}
}

function performSyncWorkOnRoot(root: FiberRootNode) {
	const nextLane = getHighestPriorityLane(root.pendingLanes);

	if (nextLane !== SyncLane) {
		/**
		 * 非 SyncLane 的优先级
		 * NoLane
		 * 调度其他优先级任务
		 */
		ensureRootIsScheduled(root);
		return;
	}
	// 进入 render 阶段
	const exitStatus = renderRoot(root, nextLane, false);

	// 如果 render 阶段完毕
	if (exitStatus === RootCompleted) {
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = nextLane;
		wipRootRenderLane = NoLane;

		// wip fiberNode树 树中的 flags 执行对应的操作
		commitRoot(root);
	} else if (__DEV__) {
		console.error('还未实现的同步更新结束状态');
	}
}

function renderRoot(root: FiberRootNode, lane: Lane, shouldTimeSlice: boolean) {
	if (__DEV__) {
		console.log(`开始${shouldTimeSlice ? '并发' : '同步'}更新`, root);
	}

	if (wipRootRenderLane !== lane) {
		// 优先级不同则把 workInProgress 重置为 root
		prepareFreshStack(root, lane);
	}

	do {
		try {
			/**
			 * 同步任务或者并发任务
			 * 由于 workInProgress 能够记录当前的工作单元，因此可以进行恢复
			 */
			shouldTimeSlice ? workLoopConcurrent() : workLoopSync();
			break;
		} catch (e) {
			if (__DEV__) {
				console.warn('workLoop发生错误', e);
			}
			workInProgress = null;
		}
	} while (true);

	// 中断执行 || render 阶段执行完
	if (shouldTimeSlice && workInProgress !== null) {
		return RootInComplete;
	}
	if (!shouldTimeSlice && workInProgress !== null && __DEV__) {
		console.error(`render阶段结束时wip不应该不是null`);
	}
	// TODO 报错
	return RootCompleted;
}

function commitRoot(root: FiberRootNode) {
	const finishedWork = root.finishedWork;

	if (finishedWork === null) {
		return;
	}

	if (__DEV__) {
		console.warn('commit阶段开始', finishedWork);
	}
	const lane = root.finishedLane;

	if (lane === NoLane && __DEV__) {
		console.error('commit阶段finishedLane不应该是NoLane');
	}

	// 重置
	root.finishedWork = null;
	root.finishedLane = NoLane;

	// commit 阶段结束之后把 root lane 对应的位清除
	markRootFinished(root, lane);

	if (
		(finishedWork.flags & PassiveMask) !== NoFlags ||
		(finishedWork.subtreeFlags & PassiveMask) !== NoFlags
	) {
		// useEffect 属于异步调度
		if (!rootDoesHasPassiveEffect) {
			rootDoesHasPassiveEffect = true;
			// 调度副作用
			scheduleCallback(NormalPriority, () => {
				// 执行副作用
				flushPassiveEffects(root.pendingPassiveEffects);
				return;
			});
		}
	}

	// 判断是否存在 3 个子阶段需要执行的操作
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags;
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

	if (subtreeHasEffect || rootHasEffect) {
		// beforeMutation
		// mutation Placement
		commitMutationEffects(finishedWork, root);
		// 在 mutation 渲染完成之后，更新 root.current
		// 这里的 finishedWork 本质上是 root.current.alternate，也就是一开始的 workInProgress
		// 这里其实就是缓存的更新了
		root.current = finishedWork;
		// layout
		commitLayoutEffects(finishedWork, root);
	} else {
		root.current = finishedWork;
	}

	rootDoesHasPassiveEffect = false;
	// 重新调度，保证 root 上任何的 pendingLanes 都能被处理
	ensureRootIsScheduled(root);
}

function flushPassiveEffects(pendingPassiveEffects: PendingPassiveEffects) {
	let didFlushPassiveEffect = false;

	pendingPassiveEffects.unmount.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListUnmount(Passive, effect);
	});
	pendingPassiveEffects.unmount = [];

	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListDestroy(Passive | HookHasEffect, effect);
	});

	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListCreate(Passive | HookHasEffect, effect);
	});
	pendingPassiveEffects.update = [];
	flushSyncCallbacks();
	return didFlushPassiveEffect;
}

// 不停的根据 wip 进行单个 fiberNode 的处理
// 此时 wip 指向的 hostRootFiber
// 开始执行 performUnitOfWork 进行递归操作
// 其中递：beginWork
// 归：completeWork
// React 通过 DFS，首先根据头部节点找到对应的叶子节点
function workLoopSync() {
	while (workInProgress !== null) {
		// 完成对单个 workInProgress 工作单元的处理
		performUnitOfWork(workInProgress);
	}
}

function workLoopConcurrent() {
	// unstable_shouldYield 判断当前执行时间是否超过了 5 毫秒，如果超过了就不继续执行下一小段任务
	while (workInProgress !== null && !unstable_shouldYield()) {
		performUnitOfWork(workInProgress);
	}
}

/**
 * "归" 阶段会调用 completeWork 方法处理 fiberNode。
 * 当某个 fiberNode 执行完 complete 方法后，
 * 如果其存在兄弟 fiberNode（fiberNode.sibling !== null），会进入其兄弟 fiber 的"递阶段"。
 * 如果不存在兄弟 fiberNode，会进入父 fiberNode 的 "归" 阶段。
 * 递阶段和归阶段会交错执行直至 HostRootFiber 的"归"阶段。
 * 到此，render 阶段的工作就结束了。
 *
 */
function performUnitOfWork(fiber: FiberNode) {
	/**
	 * 根据传入的fiberNode创建下一级fiberNode
	 * next 是 fiber 的子 fiber 或者是 null
	 */
	const next = beginWork(fiber, wipRootRenderLane);
	// 工作完成，需要将 pendingProps 复制给已经渲染的 props
	fiber.memoizedProps = fiber.pendingProps;

	/**
	 * 当遍历到叶子元素（不包含子 fiberNode）时
	 * performUnitOfWork 就会进入从下往上遍历的阶段(completeWork)。
	 */
	if (next === null) {
		// 没有子 fiber
		completeUnitOfWork(fiber);
	} else {
		// 让 workInProgress 指向下一个工作单元
		workInProgress = next;
	}
}

function completeUnitOfWork(fiber: FiberNode) {
	let node: FiberNode | null = fiber;

	do {
		completeWork(node);
		// 首先遍历兄弟节点
		const sibling = node.sibling;
		if (sibling !== null) {
			workInProgress = sibling;
			return;
		}
		// 遍历父节点
		node = node.return;
		workInProgress = node;
	} while (node !== null);
}

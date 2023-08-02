import { Container } from 'hostConfig';
import { FiberNode, FiberRootNode } from './fiber';
import {
	UpdateQueue,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate
} from './updateQueue';
import { HostRoot } from './workTags';
import { ReactElementType } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';
import { requestUpdateLanes } from './fiberLanes';
import {
	unstable_ImmediatePriority,
	unstable_runWithPriority
} from 'scheduler';

export function createContainer(container: Container) {
	// 创建2个不同的fiberNode，一个是hostRootFiber，一个是fiberRootNode，并建立联系
	// hostRootFiber.stateNode = root
	const hostRootFiber = new FiberNode(HostRoot, {}, null);
	// root.current = hostRootFiber
	const root = new FiberRootNode(container, hostRootFiber);
	hostRootFiber.updateQueue = createUpdateQueue();
	return root;
}

export function updateContainer(
	element: ReactElementType | null,
	root: FiberRootNode
) {
	// 设定优先级
	unstable_runWithPriority(unstable_ImmediatePriority, () => {
		const hostRootFiber = root.current;
		const lane = requestUpdateLanes();
		// 创建单个 update
		const update = createUpdate<ReactElementType | null>(element, lane);
		// 把单个 update 插入到更新队列
		enqueueUpdate(
			hostRootFiber.updateQueue as UpdateQueue<ReactElementType | null>,
			update
		);
		// 插入更新后进行调度
		scheduleUpdateOnFiber(hostRootFiber, lane);
	});

	return element;
}

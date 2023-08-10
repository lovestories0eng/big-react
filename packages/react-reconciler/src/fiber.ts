import { Props, Key, Ref, ReactElementType } from 'shared/ReactTypes';
import {
	ContextProvider,
	Fragment,
	FunctionComponent,
	HostComponent,
	SuspenseComponent,
	WorkTag,
	OffscreenComponent
} from './workTags';
import { Flags, NoFlags } from './fiberFlags';
import { Container } from 'hostConfig';
import { Lane, Lanes, NoLane, NoLanes } from './fiberLanes';
import { Effect } from './fiberHooks';
import { CallbackNode } from 'scheduler';
import { REACT_PROVIDER_TYPE, REACT_SUSPENSE_TYPE } from 'shared/ReactSymbols';

export interface OffscreenProps {
	mode: 'visible' | 'hidden';
	children: any;
}

export class FiberNode {
	// 类型，如 FunctionComponent () => {}
	type: any;
	tag: WorkTag;
	// 等待更新的属性
	pendingProps: Props;
	key: Key;
	// dom 引用
	stateNode: any;
	ref: Ref | null;

	// 指向父 fiberNode
	return: FiberNode | null;
	sibling: FiberNode | null;
	child: FiberNode | null;
	index: number;

	// 正在工作的属性
	memoizedProps: Props | null;
	memoizedState: any;
	/**
	 * 双缓存技术：
	 * 当所有的 ReactElement 比较完后，会生成一颗 FiberNode Tree，一共会存在两颗 FiberNode Tree
	 * current: 与视图中真实 UI 对应的 FiberNode 树
	 * workInProgress: 触发更新后，正在 reconciler 中计算的 FiberNode Tree
	 * （用于下一次的视图更新，在下一次视图更新后，会变成 current Tree）
	 */
	// 双缓存树指向（workInProgress 和 current 切换）
	alternate: FiberNode | null;

	// 副作用标识
	flags: Flags;
	// 子树的副作用
	subtreeFlags: Flags;
	updateQueue: unknown;
	deletions: FiberNode[] | null;

	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		this.tag = tag;
		this.key = key || null;
		// HostComponent <div> div DOM
		this.stateNode = null;
		// FunctionComponent () => ()
		this.type = null;

		// 指向父fiberNode
		this.return = null;
		this.sibling = null;
		this.child = null;
		this.index = 0;

		this.ref = null;

		// 作为工作单元
		this.pendingProps = pendingProps;
		this.memoizedProps = null;
		this.memoizedState = null;
		this.updateQueue = null;

		this.alternate = null;
		// 副作用
		this.flags = NoFlags;
		this.subtreeFlags = NoFlags;
		this.deletions = null;
	}
}

export interface PendingPassiveEffects {
	unmount: Effect[];
	update: Effect[];
}

export class FiberRootNode {
	container: Container;
	current: FiberNode;
	finishedWork: FiberNode | null;
	pendingLanes: Lanes;
	finishedLane: Lane;
	pendingPassiveEffects: PendingPassiveEffects;

	callbackNode: CallbackNode | null;
	callbackPriority: Lane;

	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		// FiberRootNode 的 current 指针一开始指向 hostRootFiber
		this.current = hostRootFiber;
		hostRootFiber.stateNode = this;
		this.finishedWork = null;
		this.pendingLanes = NoLanes;
		this.finishedLane = NoLane;

		this.callbackNode = null;
		this.callbackPriority = NoLane;

		this.pendingPassiveEffects = {
			unmount: [],
			update: []
		};
	}
}

export const createWorkInProgress = (
	current: FiberNode,
	pendingProps: Props
): FiberNode => {
	// workInProgress 指向被缓存的 FiberNode
	let wip = current.alternate;

	if (wip === null) {
		// 缓存为空，mount
		wip = new FiberNode(current.tag, pendingProps, current.key);
		wip.stateNode = current.stateNode;
		// 创建双缓存
		wip.alternate = current;
		current.alternate = wip;
	} else {
		// update
		wip.pendingProps = pendingProps;
		// 清掉副作用（上一次更新遗留下来的）
		wip.flags = NoFlags;
		wip.subtreeFlags = NoFlags;
		wip.deletions = null;
	}
	// 'div' App()
	wip.type = current.type;
	wip.updateQueue = current.updateQueue;
	wip.child = current.child;

	// 更新数据
	wip.memoizedProps = current.memoizedProps;
	// 更新需要的更新
	wip.memoizedState = current.memoizedState;
	wip.ref = current.ref;

	return wip;
};

export function createFiberFromElement(element: ReactElementType) {
	const { type, key, props, ref } = element;
	let fiberTag: WorkTag = FunctionComponent;
	if (typeof type === 'string') {
		fiberTag = HostComponent;
	} else if (
		// <Context.Provider/>
		typeof type === 'object' &&
		type.$$typeof === REACT_PROVIDER_TYPE
	) {
		// <Context.Provider/>
		/**
		 * {
		 *   $$typeof: Symbol(react.element),
		 * 	 props: { children, value },
		 *   type: {
		 * 	   $$typeof: Symbol(react.provider),
		 *     _context: { xxx }
		 *   }
		 * }
		 */
		fiberTag = ContextProvider;
	} else if (type === REACT_SUSPENSE_TYPE) {
		fiberTag = SuspenseComponent;
	} else if (typeof type !== 'function' && __DEV__) {
		console.warn('未定义的type类型', element);
	}
	// 取出 props，后面给 pendingProps 赋值
	const fiber = new FiberNode(fiberTag, props, key);
	// 对于一开始传入的 <App />，这里的 type 其实就是用于生成 JSX 的函数
	fiber.type = type;
	fiber.ref = ref;
	return fiber;
}

export function createFiberFromFragment(elements: any[], key: Key): FiberNode {
	const fiber = new FiberNode(Fragment, elements, key);
	return fiber;
}

export function createFiberFormOffscreen(
	pendingProps: OffscreenProps
): FiberNode {
	const fiber = new FiberNode(OffscreenComponent, pendingProps, null);
	return fiber;
}

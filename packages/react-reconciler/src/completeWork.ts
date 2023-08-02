import {
	Container,
	Instance,
	appendInitialChild,
	createInstance,
	createTextInstance
} from 'hostConfig';
import { FiberNode } from './fiber';
import {
	ContextProvider,
	Fragment,
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText,
	OffscreenComponent,
	SuspenseComponent
} from './workTags';
import { NoFlags, Ref, Update, Visibility } from './fiberFlags';
import { popProvider } from './fiberContext';

function markUpdate(fiber: FiberNode) {
	fiber.flags |= Update;
}

function markRef(fiber: FiberNode) {
	fiber.flags |= Ref;
}

// 在 mount 时构建离屏 Dom Tree, 初始化属性
// 在 update 时标记 Update (属性更新）、执行 flags 冒泡
export const completeWork = (wip: FiberNode) => {
	const newProps = wip.pendingProps;
	// 取出缓存数据
	const current = wip.alternate;

	switch (wip.tag) {
		case HostComponent:
			if (current !== null && wip.stateNode) {
				// update
				// 1. props是否变化
				// 2. 变了 Update flag
				// className style
				markUpdate(wip);
				// 标记ref
				if (current.ref !== wip.ref) {
					markRef(wip);
				}
			} else {
				// 构建 dom
				const instance = createInstance(wip.type, newProps);
				// 将 dom 插入到 dom 树中
				appendAllChildren(instance, wip);
				// 标记Ref
				if (wip.ref !== null) {
					markRef(wip);
				}
				// 把 workInProgress 的 stateNode 指向创建出来的 DOM 元素
				wip.stateNode = instance;
			}
			bubbleProperties(wip);
			return null;
		case HostText:
			if (current !== null && wip.stateNode) {
				// update
				const oldText = current.memoizedProps.content;
				const newText = newProps.content;
				if (oldText !== newText) {
					markUpdate(wip);
				}
			} else {
				const instance = createTextInstance(newProps.content);
				wip.stateNode = instance;
			}
			bubbleProperties(wip);
			return null;
		case HostRoot:
		case FunctionComponent: // 由于 appendAllChildren 会处理函数组件，因此这里无需做处理
		case Fragment:
		case OffscreenComponent:
			bubbleProperties(wip);
			return null;
		case ContextProvider:
			const context = wip.type._context;
			popProvider(context);
			bubbleProperties(wip);
			return null;
		case SuspenseComponent:
			const offscreenFiber = wip.child as FiberNode;
			const isHidden = offscreenFiber.pendingProps.mode === 'hidden';
			const currentOffscreenFiber = offscreenFiber.alternate;

			if (currentOffscreenFiber !== null) {
				// update
				const wasHidden = currentOffscreenFiber.pendingProps.mode === 'hidden';
				if (isHidden !== wasHidden) {
					offscreenFiber.flags |= Visibility;
					bubbleProperties(offscreenFiber);
				}
			} else if (isHidden) {
				offscreenFiber.flags |= Visibility;
				bubbleProperties(offscreenFiber);
			}
			bubbleProperties(wip);
			return null;
		default:
			if (__DEV__) {
				console.warn('未处理的completeWork情况', wip);
			}
			break;
	}
};

function appendAllChildren(parent: Container | Instance, wip: FiberNode) {
	let node = wip.child;
	while (node !== null) {
		if (node.tag === HostComponent || node.tag === HostText) {
			// 把类似 'div' 或文本节点插入到父节点中
			appendInitialChild(parent, node?.stateNode);
			// 另一种情况，node.child 为 FunctionComponent，也有可能套着多个函数组件
		} else if (node.child !== null) {
			// 建立父子关系
			node.child.return = node;
			node = node.child;
			continue;
		}

		// 在往下遍历之后又会往上遍历，当发现回到了原点的时候函数停止
		if (node === wip) {
			return;
		}
		while (node.sibling === null) {
			if (node.return === null || node.return === wip) {
				return;
			}
			// 没有兄弟节点之后，往上遍历
			node = node?.return;
		}
		// 为其兄弟节点建立父子关系
		node.sibling.return = node.return;
		node = node.sibling;
	}
}

function bubbleProperties(wip: FiberNode) {
	let subtreeFlags = NoFlags;
	let child = wip.child;

	while (child !== null) {
		subtreeFlags |= child.subtreeFlags;
		subtreeFlags |= child.flags;
		// 让其兄弟节点的 return 也指向当前的 wip
		child.return = wip;
		// 指向兄弟节点
		child = child.sibling;
	}
	// wip.subtreeFlags 为其所有子节点 flags 的总和
	wip.subtreeFlags |= subtreeFlags;
}

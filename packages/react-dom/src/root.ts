import { Container } from 'hostConfig';
import {
	createContainer,
	updateContainer
} from 'react-reconciler/src/fiberReconciler';
import { ReactElementType } from 'shared/ReactTypes';
import { intiEvent } from './SynctheticEvent';

// 创建根 fiberRootNode 节点
export function createRoot(container: Container) {
	// 创建 FiberRootNode
	const root = createContainer(container);

	return {
		// 返回render函数用于渲染
		render(element: ReactElementType) {
			intiEvent(container, 'click');
			return updateContainer(element, root);
		}
	};
}

import { Container } from 'hostConfig';
import {
	createContainer,
	updateContainer
} from 'react-reconciler/src/fiberReconciler';
import { ReactElementType } from 'shared/ReactTypes';
import { intiEvent } from './SynctheticEvent';

export function createRoot(container: Container) {
	const root = createContainer(container);

	return {
		render(element: ReactElementType) {
			intiEvent(container, 'click');
			return updateContainer(element, root);
		}
	};
}

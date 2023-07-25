import { REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE } from 'shared/ReactSymbols';
import {
	Type,
	Key,
	Ref,
	Props,
	ReactElementType,
	ElementType
} from 'shared/ReactTypes';

// 根据传入的数据，生成一个ReactElement对象
const ReactElement = function (
	type: Type,
	key: Key,
	ref: Ref,
	props: Props
): ReactElementType {
	const element = {
		$$typeof: REACT_ELEMENT_TYPE,
		type,
		key,
		ref,
		props
	};

	return element;
};

export function isValidElement(object: any) {
	return (
		typeof object === 'object' &&
		object !== null &&
		object.$$typeof === REACT_ELEMENT_TYPE
	);
}

/**
 *
 * @param type 元素类型
 * @param config 元素属性，包括key，不包括子元素children
 * @param maybeChildren 子元素children
 * @returns 返回一个ReactElement
 */
export const jsx = (type: ElementType, config: any, ...maybeChildren: any) => {
	// reactElement 自身的属性
	let key: Key = null;
	let ref: Ref | null = null;

	// 创建一个空对象props，用于存储属性
	const props: Props = {};

	// 使用 for in 循环遍历对象的属性时，原型链上的所有属性都将被访问
	// 遍历config对象，将ref、key这些ReactElement内部使用的属性提取出来，不应该被传递下去
	for (const prop in config) {
		const val = config[prop];
		// 处理 key 属性
		if (prop === 'key') {
			if (val !== undefined) {
				key = '' + val;
			}
			continue;
		}

		// 处理 ref 属性
		if (prop === 'ref') {
			if (val !== undefined) {
				ref = val;
			}
			continue;
		}
		// 去除 config 原型链上的属性，只要自身
		// 在 config 对象中查找指定的属性 prop 是否存在并返回结果
		if (Object.hasOwnProperty.call(config, prop)) {
			props[prop] = val;
		}
	}

	const maybeChildrenLength = maybeChildren.length;
	if (maybeChildrenLength) {
		// child [child, child, child]
		if (maybeChildrenLength === 1) {
			props.children = maybeChildren[0];
		} else {
			props.children = maybeChildren;
		}
	}

	return ReactElement(type, key, ref as Ref, props);
};

export const Fragment = REACT_FRAGMENT_TYPE;

export const jsxDEV = (type: ElementType, config: any) => {
	let key: Key = null;
	const props: Props = {};
	let ref: Ref | null = null;

	for (const prop in config) {
		const val = config[prop];
		if (prop === 'key') {
			if (val !== undefined) {
				key = '' + val;
			}
			continue;
		}
		if (prop === 'ref') {
			if (val !== undefined) {
				ref = val;
			}
			continue;
		}
		if (Object.hasOwnProperty.call(config, prop)) {
			props[prop] = val;
		}
	}
	return ReactElement(type, key, ref as Ref, props);
};

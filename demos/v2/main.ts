import './style.css';

// https://juejin.cn/post/7094922406451478564?searchId=20230811153852ED78E2CE581D57D60F62
const root = document.querySelector('#root');
import {
	unstable_ImmediatePriority as ImmerdiatelyPriority,
	unstable_UserBlockingPriority as UserBlockingPriority,
	unstable_NormalPriority as NormalPriority,
	unstable_LowPriority as LowPriority,
	unstable_IdlePriority as IdlePriority,
	unstable_scheduleCallback as scheduleCallback,
	unstable_shouldYield as shouldYield,
	CallbackNode,
	unstable_getFirstCallbackNode as getFirstCallbackNode,
	unstable_cancelCallback as cancelCallback
} from 'scheduler';

type Priority =
	| typeof ImmerdiatelyPriority // 1 同步更新
	| typeof UserBlockingPriority // 2
	| typeof NormalPriority // 3
	| typeof LowPriority // 4
	| typeof IdlePriority; // 5

interface Work {
	count: number;
	priority: Priority;
}

const workList: Work[] = [];
// 本次调度任务进行时，正在执行的调度的优先级默认是空闲优先级
let prevPriority: Priority = IdlePriority;
// 全局创建当前被调度的回调函数
let curCallback: CallbackNode | null = null;

[
	ImmerdiatelyPriority,
	UserBlockingPriority,
	NormalPriority,
	LowPriority
].forEach((priority) => {
	const btn = document.createElement('button');
	root?.appendChild(btn);
	btn.innerText = [
		'',
		'ImmerdiatelyPriority',
		'UserBlockingPriority',
		'NormalPriority',
		'LowPriority'
	][priority];
	btn.onclick = () => {
		workList.unshift({
			count: 100,
			priority: priority as Priority
		});
		schedule();
	};
});

function schedule() {
	const cbNode = getFirstCallbackNode();
	// 找到最高优先级 work
	const curWork = workList.sort((w1, w2) => w1.priority - w2.priority)[0];

	// 策略逻辑
	if (!curWork) {
		curCallback = null;
		cbNode && cancelCallback(cbNode);
		return;
	}

	const { priority: curPriority } = curWork;
	if (curPriority === prevPriority) {
		return;
	}

	// 更高优先级的work
	cbNode && cancelCallback(cbNode);

	curCallback = scheduleCallback(curPriority, perform.bind(null, curWork));
}

function perform(work: Work, didTimeout?: boolean) {
	/**
	 * 1. work.priority
	 * 2. 饥饿问题
	 * 3. 时间切片
	 */
	const needSync = work.priority === ImmerdiatelyPriority || didTimeout;
	while ((needSync || !shouldYield()) && work.count) {
		work.count--;
		insertSpan(work.priority + '');
	}

	// 中断执行 || 执行完
	prevPriority = work.priority;

	if (!work.count) {
		const workIndex = workList.indexOf(work);
		// 任务做完，把 work 从 workList 中剔除
		workList.splice(workIndex, 1);
		prevPriority = IdlePriority;
	}

	const prevCallback = curCallback;
	// 继续调度
	schedule();
	const newCallback = curCallback;

	if (newCallback && prevCallback === newCallback) {
		return perform.bind(null, work);
	}
}

function insertSpan(content) {
	const span = document.createElement('span');
	span.innerText = content;
	span.className = `pri-${content}`;
	doSomeBusyWork(1000000);
	root?.appendChild(span);
}

function doSomeBusyWork(len: number) {
	let result = 0;
	while (len--) {
		result += len;
	}
}

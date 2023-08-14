import './style.css';

// https://juejin.cn/post/7094922406451478564?searchId=20230811153852ED78E2CE581D57D60F62
const root = document.querySelector('#root');
import {
	unstable_ImmediatePriority as ImmerdiatelyPriority,
	unstable_UserBlockingPriority as UserBlockingPriority,
	unstable_NormalPriority as NormalPriority,
	unstable_LowPriority as LowPriority,
	unstable_IdlePriority as IdlePriority,
	unstable_scheduleCallback as scheduleCallback, // 调度器
	unstable_shouldYield as shouldYield, // 当前帧是否用尽了
	unstable_getFirstCallbackNode as getFirstCallbackNode, // 返回当前第一个正在调度的任务
	unstable_cancelCallback as cancelCallback, // 取消调度
	CallbackNode
} from 'scheduler';

type Priority =
	| typeof ImmerdiatelyPriority // 1 立刻执行的优先级
	| typeof UserBlockingPriority // 2 用户阻塞优先级
	| typeof NormalPriority // 3 正常优先级
	| typeof LowPriority // 4 低优先级
	| typeof IdlePriority; // 5 空闲优先级

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

// 开始任务调度
function schedule() {
	// 获取当前调度的任务
	const cbNode = getFirstCallbackNode();
	// 找到最高优先级 work
	const curWork = workList.sort((w1, w2) => w1.priority - w2.priority)[0];

	// 策略逻辑
	if (!curWork) {
		// 没有任务
		curCallback = null;
		cbNode && cancelCallback(cbNode);
		return;
	}

	const { priority: curPriority } = curWork;

	// 如果最新任务的优先级和当前执行的任务优先级一样就没必要打断当前执行的
	if (curPriority === prevPriority) {
		return;
	}

	// 更高优先级的 work，先取消当前调度的任务
	cbNode && cancelCallback(cbNode);
	// 开始执行任务调度
	curCallback = scheduleCallback(curPriority, perform.bind(null, curWork));
}

function perform(work: Work, didTimeout?: boolean) {
	/**
	 * 1. work.priority
	 * 2. 饥饿问题
	 * 3. 时间切片
	 */
	// didTimeout 用来返回当前正在执行的任务是否需要中断掉（需要中断的时候说明有更高优先级的任务来了）
	// 是否需要同步执行（同步执行的任务是不可中断的，也是优先级最高的）
	const needSync = work.priority === ImmerdiatelyPriority || didTimeout;
	// shouldYield() 获取浏览器是否还有剩余时间，每个调度任务过程只有5ms 如果超过5ms，就会返回true终止本次调度
	while ((needSync || !shouldYield()) && work.count) {
		work.count--;
		insertSpan(work.priority + '');
	}

	// 执行被中断 || 执行完
	// 获取当前任务的优先级下次在进行 schduler 调度的时候可以用来和新任务比较
	prevPriority = work.priority;

	// 当前 work 执行完了删除队列中的任务并且将当前优先级重置为空闲优先级，方便下次进行调度计算
	if (!work.count) {
		const workIndex = workList.indexOf(work);
		// 任务做完，把 work 从 workList 中剔除
		workList.splice(workIndex, 1);
		prevPriority = IdlePriority;
	}

	// 存储当回调
	const prevCallback = curCallback;
	// 继续调度
	schedule();
	// 获取新的回调
	const newCallback = curCallback;

	// 符合这条逻辑说明新的回调函数和当前的回调函数一样，所以就没必要走 schduler，直接走 perform 继续渲染就可以
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

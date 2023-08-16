import {
	unstable_NormalPriority as NormalPriority,
	unstable_scheduleCallback
} from 'scheduler';

function printA(didTimeout) {
	const start = new Date().getTime();
	while (new Date().getTime() - start < 7) {}
	console.log('A didTimeout:', didTimeout);
}
function printB(didTimeout) {
	const start = new Date().getTime();
	while (new Date().getTime() - start < 3) {}
	console.log('B didTimeout:', didTimeout);
}
function printC(didTimeout) {
	const start = new Date().getTime();
	while (new Date().getTime() - start < 4) {}
	console.log('C didTimeout:', didTimeout);
}
function printD(didTimeout) {
	const start = new Date().getTime();
	while (new Date().getTime() - start < 7) {}
	console.log('D didTimeout:', didTimeout);
}
function printE(didTimeout) {
	const start = new Date().getTime();
	while (new Date().getTime() - start < 10) {}
	console.log('E didTimeout:', didTimeout);
}

unstable_scheduleCallback(NormalPriority, printA);
unstable_scheduleCallback(NormalPriority, printB);
unstable_scheduleCallback(NormalPriority, printC);
unstable_scheduleCallback(NormalPriority, printD);
unstable_scheduleCallback(NormalPriority, printE);

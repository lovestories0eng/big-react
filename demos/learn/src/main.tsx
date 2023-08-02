import React, { useState } from 'react';
import ReactDOM from 'react-dom';

function App() {
	const [num, update] = useState(10);

	return (
		<>
			{/* <ul onClick={() => update(50)}>
				{new Array(num).fill(0).map((_, i) => {
					return <Child key={i}>{i}</Child>;
				})}
			</ul>
			<Child children={'children'} /> */}
			<div>
				{/* 这里其实是元素数量为 4 的数组 */}
				test1
				<div>test test 1</div>
				<div>test test 2</div>
				<div>test test 3</div>
			</div>
			<div>test2</div>
			<div>test3</div>
		</>
	);
}

function Child({ children }) {
	return <li>{children}</li>;
}

console.log(
	<>
		<div>
			test1
			<div>test test 1</div>
			<div>test test 2</div>
			<div>test test 3</div>
		</div>
		<div>test2</div>
		<div>test3</div>
	</>
);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<App />
);

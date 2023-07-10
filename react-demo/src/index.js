import React from 'react';
import ReactDOM from 'react-dom';

function App() {
	return (
		<div>
			<Child />
		</div>
	);
}

function Child() {
	return <span>big-react</span>;
}

const jsx = (
	<div>
		<span>big-react</span>
	</div>
);

const root = document.querySelector('#root');

ReactDOM.createRoot(root).render(<App />);

console.log(React);
console.log(jsx);
console.log(ReactDOM);

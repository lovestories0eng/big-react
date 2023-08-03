import React, { useState } from 'react';
import ReactDOM from 'react-dom';

function App() {
	const [num, setNum] = useState(10);

	return (
		<div>
			<button
				key={1}
				onClick={() => {
					setNum(2);
					setNum(3);
					setNum(1);
				}}
			>
				state test
			</button>
			<div>{num}</div>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<App />
);

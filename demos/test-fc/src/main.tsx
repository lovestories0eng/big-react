import React, { useState } from 'react';
import ReactDOM from 'react-dom';

function App() {
	const [num, setNum] = useState(100);
	return <div onClick={() => setNum(num + 1)}>{num}</div>;
}

function Child() {
	return <span>big-react</span>;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<App />
);

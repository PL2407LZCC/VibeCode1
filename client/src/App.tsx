import { useState } from 'react';

function App() {
  const [selectedCount, setSelectedCount] = useState(0);

  return (
    <main>
      <h1>VibeCode Snack Kiosk</h1>
      <p>Front-end scaffold is ready. Products will load here.</p>
      <button type="button" onClick={() => setSelectedCount((count) => count + 1)}>
        Select Sample Item ({selectedCount})
      </button>
    </main>
  );
}

export default App;

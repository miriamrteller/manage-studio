import { RouterProvider } from 'react-router-dom';
import router from './router';
import { AppShell } from './AppShell';

export default function App() {
  return (
    <AppShell>
      <RouterProvider router={router} />
    </AppShell>
  );
}

import { createBrowserRouter } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import AdminDashboard from './pages/AdminDashboard'
import PortalDashboard from './pages/PortalDashboard'
import NotFoundPage from './pages/NotFoundPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <div className="min-h-screen bg-white" />,
    errorElement: <NotFoundPage />,
    children: [
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'signup',
        element: <SignupPage />,
      },
      {
        path: 'admin',
        children: [
          {
            path: 'dashboard',
            element: <AdminDashboard />,
          },
        ],
      },
      {
        path: 'portal',
        children: [
          {
            path: 'dashboard',
            element: <PortalDashboard />,
          },
        ],
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
])

export default router

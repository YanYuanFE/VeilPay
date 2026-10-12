import { createBrowserRouter, RouterProvider } from 'react-router'
import { Layout } from '@/components/Layout'
import { Providers } from '@/lib/session'
import { Home } from '@/pages/Home'
import { Landing } from '@/pages/Landing'
import { JoinPage } from '@/pages/Join'
import { MyPayPage } from '@/pages/MyPay'
import { OrgPage } from '@/pages/Org'
import { VerifyPage } from '@/pages/Verify'
import { DocsPage } from '@/pages/Docs'

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  {
    element: <Layout />,
    children: [
      { path: '/app', element: <Home /> },
      { path: '/orgs/:id', element: <OrgPage /> },
      { path: '/join/:code', element: <JoinPage /> },
      { path: '/me', element: <MyPayPage /> },
      { path: '/verify', element: <VerifyPage /> },
      { path: '/docs', element: <DocsPage /> },
    ],
  },
])

export default function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  )
}

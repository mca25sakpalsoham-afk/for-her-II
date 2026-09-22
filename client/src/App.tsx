import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { useAuth } from './context/AuthContext'
import { AppLayout } from './components/AppLayout'
import { CallOverlay } from './components/CallOverlay'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { CyclePage } from './pages/CyclePage'
import { MoodPage } from './pages/MoodPage'
import { CravingsPage } from './pages/CravingsPage'
import { CallPage, MessagesPage, NotificationsPage, RequestsPage, SettingsPage, TimelinePage } from './pages/RelationshipPages'

function Protected() { const { auth, loading } = useAuth(); const location = useLocation(); if (loading) return <div className="grid min-h-screen place-items-center bg-cream text-wine dark:bg-[#171317]"><Heart className="animate-pulse" fill="currentColor" /></div>; return auth ? <AppLayout /> : <Navigate to="/login" replace state={{ from: location.pathname }} /> }
function NotFound() { return <div className="grid min-h-screen place-items-center bg-cream p-5 text-center dark:bg-[#171317]"><div><Heart className="mx-auto text-rose" fill="currentColor" /><h1 className="mt-4 font-display text-3xl dark:text-cream">This little corner doesn’t exist.</h1><a className="mt-4 inline-block text-wine underline dark:text-[#f1a3b2]" href="/">Go home</a></div></div> }
export default function App() { useEffect(() => { document.documentElement.classList.toggle('dark', localStorage.getItem('for-her-theme') === 'dark') }, []); return <><Routes><Route path="/login" element={<LoginPage />} /><Route element={<Protected />}><Route path="/" element={<DashboardPage />} /><Route path="/dashboard" element={<Navigate to="/" replace />} /><Route path="/cycle" element={<CyclePage />} /><Route path="/mood" element={<MoodPage />} /><Route path="/cravings" element={<CravingsPage />} /><Route path="/requests" element={<RequestsPage />} /><Route path="/call" element={<CallPage />} /><Route path="/timeline" element={<TimelinePage />} /><Route path="/messages" element={<MessagesPage />} /><Route path="/notifications" element={<NotificationsPage />} /><Route path="/settings" element={<SettingsPage />} /><Route path="/profile" element={<SettingsPage />} /></Route><Route path="*" element={<NotFound />} /></Routes><CallOverlay /></> }

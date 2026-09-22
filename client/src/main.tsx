import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { SocketProvider } from './context/SocketContext'
import { CallProvider } from './context/CallContext'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><AuthProvider><SocketProvider><CallProvider><App /></CallProvider></SocketProvider></AuthProvider></BrowserRouter></React.StrictMode>)

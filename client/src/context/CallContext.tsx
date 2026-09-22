import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Socket } from 'socket.io-client'
import { request } from '../services/api'
import { useAuth } from './AuthContext'
import { useSocket } from './SocketContext'
import type { User, VideoCall } from '../types'

export type CallPhase = 'IDLE' | 'CALLING' | 'INCOMING' | 'CONNECTING' | 'CONNECTED' | 'DECLINED' | 'ENDED' | 'FAILED'
type CallState = { phase: CallPhase; call: VideoCall | null; peer: Partial<User> | null; error?: string }
type CallContextValue = CallState & { localStream: MediaStream | null; remoteStream: MediaStream | null; muted: boolean; cameraOn: boolean; speakerOn: boolean; startCall: () => void; accept: () => Promise<void>; decline: () => void; end: () => void; toggleMuted: () => void; toggleCamera: () => void; switchCamera: () => Promise<void>; toggleSpeaker: () => void }
const CallContext = createContext<CallContextValue | null>(null)

function ack(socket: Socket, event: string, payload: unknown) {
  return new Promise<any>((resolve) => socket.emit(event, payload, resolve))
}
export function CallProvider({ children }: { children: ReactNode }) {
  const { auth } = useAuth(); const { socket } = useSocket()
  const [state, setState] = useState<CallState>({ phase: 'IDLE', call: null, peer: null })
  const [localStream, setLocalStream] = useState<MediaStream | null>(null); const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [muted, setMuted] = useState(false); const [cameraOn, setCameraOn] = useState(true); const [speakerOn, setSpeakerOn] = useState(true)
  const callRef = useRef<VideoCall | null>(null); const peerRef = useRef<RTCPeerConnection | null>(null); const localRef = useRef<MediaStream | null>(null); const candidates = useRef<RTCIceCandidateInit[]>([])
  const update = useCallback((next: CallState) => { callRef.current = next.call; setState(next) }, [])
  const cleanup = useCallback(() => { peerRef.current?.close(); peerRef.current = null; localRef.current?.getTracks().forEach((track) => track.stop()); localRef.current = null; candidates.current = []; setLocalStream(null); setRemoteStream(null); setMuted(false); setCameraOn(true) }, [])
  const finish = useCallback((phase: Extract<CallPhase, 'DECLINED' | 'ENDED' | 'FAILED'>, error?: string) => { cleanup(); update({ phase, call: callRef.current, peer: state.peer, error }); window.setTimeout(() => { if (callRef.current) update({ phase: 'IDLE', call: null, peer: null }) }, 2400) }, [cleanup, state.peer, update])
  const prepareMedia = useCallback(async () => {
    if (localRef.current) return localRef.current
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Video calling is not supported by this browser')
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
    localRef.current = stream; setLocalStream(stream); return stream
  }, [])
  const createPeer = useCallback(async () => {
    if (peerRef.current) return peerRef.current
    const stream = await prepareMedia(); const config = await request<{ iceServers: RTCIceServer[] }>('get', '/calls/config')
    const peer = new RTCPeerConnection(config); peerRef.current = peer
    stream.getTracks().forEach((track) => peer.addTrack(track, stream))
    peer.ontrack = (event) => setRemoteStream(event.streams[0] || new MediaStream([event.track]))
    peer.onicecandidate = (event) => { if (event.candidate && callRef.current) socket?.emit('call:ice-candidate', { callId: callRef.current.id, candidate: event.candidate.toJSON() }) }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') update({ phase: 'CONNECTED', call: callRef.current, peer: state.peer })
      if (peer.connectionState === 'failed') finish('FAILED', 'The connection could not be established. Try calling again.')
    }
    return peer
  }, [finish, prepareMedia, socket, state.peer, update])
  const applyCandidates = useCallback(async (peer: RTCPeerConnection) => { for (const candidate of candidates.current.splice(0)) await peer.addIceCandidate(candidate) }, [])

  useEffect(() => {
    if (!socket || !auth) return
    const incoming = (payload: { call: VideoCall; caller: User }) => { if (payload.call.receiverId === auth.user.id) update({ phase: 'INCOMING', call: payload.call, peer: payload.caller }) }
    const accepted = async (payload: { call: VideoCall; acceptedBy: string }) => {
      if (payload.call.id !== callRef.current?.id) return
      update({ phase: 'CONNECTING', call: payload.call, peer: state.peer })
      if (payload.acceptedBy !== auth.user.id) {
        try { const peer = await createPeer(); const offer = await peer.createOffer(); await peer.setLocalDescription(offer); socket.emit('call:offer', { callId: payload.call.id, offer }) } catch (error) { finish('FAILED', error instanceof Error ? error.message : 'Camera or microphone access failed') }
      }
    }
    const offer = async (payload: { callId: string; offer: RTCSessionDescriptionInit; from: string }) => {
      if (payload.callId !== callRef.current?.id || payload.from === auth.user.id) return
      try { const peer = await createPeer(); await peer.setRemoteDescription(payload.offer); await applyCandidates(peer); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); socket.emit('call:answer', { callId: payload.callId, answer }) } catch (error) { finish('FAILED', error instanceof Error ? error.message : 'Could not connect the call') }
    }
    const answer = async (payload: { callId: string; answer: RTCSessionDescriptionInit; from: string }) => { if (payload.callId === callRef.current?.id && payload.from !== auth.user.id && peerRef.current) { await peerRef.current.setRemoteDescription(payload.answer); await applyCandidates(peerRef.current) } }
    const candidate = async (payload: { callId: string; candidate: RTCIceCandidateInit; from: string }) => { if (payload.callId !== callRef.current?.id || payload.from === auth.user.id) return; if (peerRef.current?.remoteDescription) await peerRef.current.addIceCandidate(payload.candidate); else candidates.current.push(payload.candidate) }
    const declined = (payload: { call: VideoCall }) => { if (payload.call.id === callRef.current?.id) finish('DECLINED') }
    const ended = (payload: { call: VideoCall }) => { if (payload.call.id === callRef.current?.id) finish('ENDED') }
    socket.on('call:invite', incoming); socket.on('call:accept', accepted); socket.on('call:offer', offer); socket.on('call:answer', answer); socket.on('call:ice-candidate', candidate); socket.on('call:decline', declined); socket.on('call:end', ended)
    return () => { socket.off('call:invite', incoming); socket.off('call:accept', accepted); socket.off('call:offer', offer); socket.off('call:answer', answer); socket.off('call:ice-candidate', candidate); socket.off('call:decline', declined); socket.off('call:end', ended) }
  }, [applyCandidates, auth, createPeer, finish, socket, state.peer, update])
  useEffect(() => () => cleanup(), [cleanup])

  const startCall = () => {
    if (!socket || state.phase !== 'IDLE') return
    socket.emit('call:invite', {}, (result: { ok: boolean; call?: VideoCall; message?: string }) => result.ok && result.call ? update({ phase: 'CALLING', call: result.call, peer: null }) : finish('FAILED', result.message || 'Unable to start call'))
  }
  const accept = async () => {
    if (!socket || !callRef.current) return
    try { await prepareMedia(); const result = await ack(socket, 'call:accept', { callId: callRef.current.id }); if (!result?.ok) throw new Error(result?.message || 'Call is no longer available'); update({ phase: 'CONNECTING', call: result.call, peer: state.peer }) } catch (error) { finish('FAILED', error instanceof Error ? error.message : 'Camera or microphone access failed') }
  }
  const decline = () => { if (socket && callRef.current) socket.emit('call:decline', { callId: callRef.current.id }); else finish('DECLINED') }
  const end = () => { if (socket && callRef.current) socket.emit('call:end', { callId: callRef.current.id }); finish('ENDED') }
  const toggleMuted = () => { const next = !muted; localRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next }); setMuted(next) }
  const toggleCamera = () => { const next = !cameraOn; localRef.current?.getVideoTracks().forEach((track) => { track.enabled = next }); setCameraOn(next) }
  const switchCamera = async () => {
    const oldTrack = localRef.current?.getVideoTracks()[0]; if (!oldTrack || !navigator.mediaDevices?.getUserMedia) return
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); const replacement = stream.getVideoTracks()[0]; const sender = peerRef.current?.getSenders().find((item) => item.track?.kind === 'video'); await sender?.replaceTrack(replacement); localRef.current?.removeTrack(oldTrack); oldTrack.stop(); localRef.current?.addTrack(replacement); setLocalStream(new MediaStream(localRef.current?.getTracks() || [])) } catch { setState((current) => ({ ...current, error: 'A second camera is not available on this device.' })) }
  }
  const toggleSpeaker = () => setSpeakerOn((on) => !on)
  return <CallContext.Provider value={{ ...state, localStream, remoteStream, muted, cameraOn, speakerOn, startCall, accept, decline, end, toggleMuted, toggleCamera, switchCamera, toggleSpeaker }}>{children}</CallContext.Provider>
}
export function useCall() { const context = useContext(CallContext); if (!context) throw new Error('useCall must be used within CallProvider'); return context }

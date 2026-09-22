import { useCallback, useEffect, useState } from 'react'
import { formatApiError, request } from '../services/api'

export function useResource<T>(url: string, initial: T) {
  const [data, setData] = useState<T>(initial); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const refresh = useCallback(async () => { setLoading(true); setError(''); try { setData(await request<T>('get', url)) } catch (err) { setError(formatApiError(err)) } finally { setLoading(false) } }, [url])
  useEffect(() => { void refresh() }, [refresh])
  return { data, setData, loading, error, refresh }
}

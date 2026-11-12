'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { backendError, backendFetch } from './backend-client'

export type ResourceState<T> = {
  data: T | null
  error: string | null
  loading: boolean
  offline: boolean
  stale: boolean
  updatedAt: Date | null
  retry: () => void
}

const STALE_AFTER_MS = 60_000
const REFRESH_AFTER_MS = 30_000

export function useLiveResource<T>(endpoint: string | null): ResourceState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [stale, setStale] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [attempt, setAttempt] = useState(0)
  const controller = useRef<AbortController | null>(null)
  const dataRef = useRef<T | null>(null)
  const updatedAtRef = useRef<Date | null>(null)

  useEffect(() => {
    dataRef.current = null
    updatedAtRef.current = null
    setData(null)
    setUpdatedAt(null)
    setStale(false)
  }, [endpoint])

  const load = useCallback(async () => {
    if (!endpoint) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    if (!dataRef.current) setLoading(true)
    try {
      const response = await backendFetch(endpoint, {
        headers: { accept: 'application/json' },
        signal: next.signal,
      })
      const body = (await response.json().catch(() => null)) as
        | { error?: string; message?: string }
        | T
        | null
      if (!response.ok) {
        throw new Error(backendError(body, response.status))
      }
      if (next.signal.aborted) return
      dataRef.current = body as T
      setData(body as T)
      setError(null)
      setOffline(false)
      setStale(false)
      const receivedAt = new Date()
      updatedAtRef.current = receivedAt
      setUpdatedAt(receivedAt)
    } catch (reason) {
      if (next.signal.aborted) return
      setError(reason instanceof Error ? reason.message : 'Unable to load data')
      setOffline(typeof navigator !== 'undefined' && !navigator.onLine)
      setStale(Boolean(dataRef.current))
    } finally {
      if (!next.signal.aborted) setLoading(false)
    }
  }, [endpoint])

  useEffect(() => {
    void load()
    if (!endpoint) return
    const refresh = window.setInterval(() => void load(), REFRESH_AFTER_MS)
    const staleCheck = window.setInterval(() => {
      if (updatedAtRef.current) {
        setStale(Date.now() - updatedAtRef.current.getTime() > STALE_AFTER_MS)
      }
    }, 5_000)
    const online = () => {
      setOffline(false)
      void load()
    }
    const offlineListener = () => setOffline(true)
    const visible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    window.addEventListener('online', online)
    window.addEventListener('offline', offlineListener)
    document.addEventListener('visibilitychange', visible)
    const invalidate = () => void load()
    window.addEventListener('gmritdu:data-change', invalidate)
    return () => {
      controller.current?.abort()
      window.clearInterval(refresh)
      window.clearInterval(staleCheck)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offlineListener)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('gmritdu:data-change', invalidate)
    }
  }, [attempt, endpoint, load])

  return {
    data,
    error,
    loading,
    offline,
    stale,
    updatedAt,
    retry: () => setAttempt((value) => value + 1),
  }
}

export async function mutateAcademicEndpoint(
  endpoint: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  data?: Record<string, unknown>,
) {
  const response = await backendFetch(endpoint, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-idempotency-key': crypto.randomUUID(),
    },
    body: data && method !== 'DELETE' ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  const body = (await response.json().catch(() => null)) as {
    error?: string
    message?: string
    reference?: string
  } | null
  if (!response.ok) {
    const detail = backendError(body, response.status)
    throw new Error(response.status === 409 ? `Booking collision: ${detail}` : detail)
  }
  return body
}

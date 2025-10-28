import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { supabase } from '../lib/supabaseClient'
import ItineraryMap, { MapActivity } from '../components/ItineraryMap'

type Itinerary = {
  day: number
  activities: { time: string; name: string; type: string; address?: string; notes?: string; estimatedCost?: number }[]
}[]

type SavedItinerary = {
  id: string
  title?: string | null
  summary?: string | null
  created_at?: string
  itinerary?: Itinerary | null
}

type ExpenseItem = {
  id?: string
  amount: number
  category: string
  note?: string | null
  created_at?: string
  date?: string
}

const buildActivityImageUrl = (
  activity: { type: string; name: string },
  destination: string
) => {
  const keywords = [destination, activity.type, activity.name]
    .filter(Boolean)
    .map(keyword => keyword.replace(/\s+/g, ''))
    .join(',')
  return `https://source.unsplash.com/600x400/?${encodeURIComponent(keywords)}`
}

const buildExternalMapLink = (address: string, destination: string) => {
  const query = destination ? `${address} ${destination}` : address
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export default function Home() {
  const [destination, setDestination] = useState('日本')
  const [days, setDays] = useState(5)
  const [budget, setBudget] = useState(10000)
  const [partySize, setPartySize] = useState(2)
  const [preferences, setPreferences] = useState('美食, 动漫')
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [loading, setLoading] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [summary, setSummary] = useState<string | null>(null)
  const [rawSummary, setRawSummary] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)
  const expenseRecognitionRef = useRef<any>(null)
  const speechBufferRef = useRef('')
  const speechCombinedRef = useRef('')
  const expenseSpeechBufferRef = useRef('')
  const expenseCombinedRef = useRef('')
  const speechRetryRef = useRef(0)
  const speechRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const expenseRetryRef = useRef(0)
  const expenseRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speechStopReasonRef = useRef<'manual' | null>(null)
  const expenseStopReasonRef = useRef<'manual' | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [isExpenseListening, setIsExpenseListening] = useState(false)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const [expenseSpeechError, setExpenseSpeechError] = useState<string | null>(null)
  const [expenseAmount, setExpenseAmount] = useState<number | ''>('')
  const [expenseCategory, setExpenseCategory] = useState('餐饮')
  const [expenseNote, setExpenseNote] = useState('')
  const [expensesList, setExpensesList] = useState<ExpenseItem[]>([])
  const [localExpenses, setLocalExpenses] = useState<ExpenseItem[]>([])
  const [savedItineraries, setSavedItineraries] = useState<SavedItinerary[]>([])
  const [loadingItineraries, setLoadingItineraries] = useState(false)
  const [loadingExpenses, setLoadingExpenses] = useState(false)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const isLoggedIn = Boolean(authToken && userEmail)
  const expensesToDisplay = isLoggedIn ? expensesList : localExpenses
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)

  const mapActivities = useMemo<MapActivity[]>(() => {
    if (!itinerary) return []
    return itinerary.flatMap(day =>
      day.activities.map((activity, index) => ({
        id: `${day.day}-${index}`,
        day: day.day,
        name: activity.name,
        time: activity.time,
        type: activity.type,
        address: activity.address
      }))
    )
  }, [itinerary])

  const handleSelectActivity = useCallback((activityId: string) => {
    setSelectedActivityId(activityId)
    if (typeof window === 'undefined') return
    const target = document.querySelector(`[data-activity-id="${activityId}"]`)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const loadSavedItineraries = useCallback(async (token: string | null) => {
    if (!token) return
    setLoadingItineraries(true)
    try {
      const res = await fetch('/api/itineraries', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const payload = await res.json()
        const items = Array.isArray(payload?.data) ? payload.data : []
        setSavedItineraries(items)
      } else if (res.status === 401) {
        setAuthToken(null)
        setUserEmail(null)
      }
    } catch (err) {
      console.error('加载云端行程失败', err)
    } finally {
      setLoadingItineraries(false)
    }
  }, [setAuthToken, setUserEmail])

  const loadSavedExpenses = useCallback(async (token: string | null) => {
    if (!token) return
    setLoadingExpenses(true)
    try {
      const res = await fetch('/api/expenses', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const payload = await res.json()
        const items = (Array.isArray(payload?.data) ? payload.data : []).map((item: any) => ({
          ...item,
          amount: typeof item?.amount === 'string' ? Number(item.amount) : item?.amount
        }))
        setExpensesList(items)
      } else if (res.status === 401) {
        setAuthToken(null)
        setUserEmail(null)
      }
    } catch (err) {
      console.error('加载云端费用失败', err)
    } finally {
      setLoadingExpenses(false)
    }
  }, [setAuthToken, setUserEmail])

  const loadSavedData = useCallback(async (token: string | null) => {
    if (!token) return
    await Promise.all([loadSavedItineraries(token), loadSavedExpenses(token)])
  }, [loadSavedExpenses, loadSavedItineraries])

  const buildItineraryTitle = useCallback(() => `${destination} ${days} 天行程`, [destination, days])

  const applySavedItinerary = useCallback((item: SavedItinerary) => {
    if (item.itinerary && Array.isArray(item.itinerary)) {
      setItinerary(item.itinerary)
    } else {
      setItinerary(null)
    }
    if (typeof item.summary === 'string') {
      setRawSummary(item.summary)
    } else {
      setRawSummary(null)
    }
    setSummary(null)
  }, [])

  const formatExpenseTime = useCallback((item: ExpenseItem) => {
    const ts = item.created_at || item.date
    if (!ts) return ''
    try {
      return new Date(ts).toLocaleString()
    } catch (err) {
      return String(ts)
    }
  }, [])

  const resolveItineraryTitle = useCallback((item: SavedItinerary) => {
    if (item.title && item.title.trim().length > 0) return item.title
    if (typeof item.summary === 'string' && item.summary.trim().length > 0) {
      const trimmed = item.summary.trim()
      return trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : trimmed
    }
    return `行程记录 ${item.created_at ? new Date(item.created_at).toLocaleString() : ''}`
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const sessionResult = await supabase.auth.getSession()
        if (!mounted) return
        const session = sessionResult?.data?.session
        if (session?.access_token) {
          setAuthToken(session.access_token)
          setUserEmail(session.user?.email || null)
          await loadSavedData(session.access_token)
        } else {
          setAuthToken(null)
          setUserEmail(null)
          setSavedItineraries([])
          setExpensesList([])
        }
      } catch (err) {
        console.warn('获取 Supabase 会话失败', err)
      }
    })()

    const subscriptionWrapper = supabase.auth.onAuthStateChange?.((_event: any, session: any) => {
      if (!mounted) return
      if (session?.access_token) {
        setAuthToken(session.access_token)
        setUserEmail(session.user?.email || null)
        loadSavedData(session.access_token)
      } else {
        setAuthToken(null)
        setUserEmail(null)
        setSavedItineraries([])
        setExpensesList([])
      }
    })

    return () => {
      mounted = false
      const sub = subscriptionWrapper?.data?.subscription || subscriptionWrapper?.subscription
      sub?.unsubscribe?.()
    }
  }, [loadSavedData])

  useEffect(() => {
    return () => {
      try {
        if (speechRetryTimeoutRef.current) {
          clearTimeout(speechRetryTimeoutRef.current)
          speechRetryTimeoutRef.current = null
        }
        if (expenseRetryTimeoutRef.current) {
          clearTimeout(expenseRetryTimeoutRef.current)
          expenseRetryTimeoutRef.current = null
        }
        if (recognitionRef.current) {
          recognitionRef.current.onresult = null
          recognitionRef.current.stop?.()
          recognitionRef.current.abort?.()
        }
      } catch (err) {
        // ignore cleanup errors
      } finally {
        recognitionRef.current = null
      }
      try {
        if (expenseRecognitionRef.current) {
          expenseRecognitionRef.current.onresult = null
          expenseRecognitionRef.current.stop?.()
          expenseRecognitionRef.current.abort?.()
        }
      } catch (err) {
        // ignore cleanup errors
      } finally {
        expenseRecognitionRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!itinerary || !Array.isArray(itinerary)) {
      setSelectedActivityId(null)
      return
    }
    const firstWithAddress = itinerary
      .flatMap(day => day.activities.map((activity, index) => ({
        id: `${day.day}-${index}`,
        address: activity.address
      })))
      .find(item => item.address && item.address.trim().length > 0)

    setSelectedActivityId(firstWithAddress ? firstWithAddress.id : null)
  }, [itinerary])

  const saveItinerary = async () => {
    if (!itinerary) return alert('没有可保存的行程')
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`
      const payload = { itinerary, summary: rawSummary, title: buildItineraryTitle() }
      const res = await fetch('/api/save', { method: 'POST', headers, body: JSON.stringify(payload) })
      const j = await res.json()
      if (res.ok) {
        if (authToken) {
          await loadSavedItineraries(authToken)
          alert('已保存到 Supabase')
        } else {
          alert('已保存（mock）')
        }
      } else {
        alert('保存失败: ' + (j?.error || res.status))
      }
    } catch (err) {
      console.error(err)
      alert('保存请求失败')
    }
  }

  const saveExpense = async () => {
    if (!expenseAmount || !expenseCategory) return alert('请填写金额与分类')
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`
      const numericAmount = Number(expenseAmount)
      const payload = { amount: numericAmount, category: expenseCategory, note: expenseNote }
      const res = await fetch('/api/expenses', { method: 'POST', headers, body: JSON.stringify(payload) })
      const j = await res.json()
      if (res.ok) {
        if (authToken) {
          await loadSavedExpenses(authToken)
          alert('已记录并同步')
        } else {
          setLocalExpenses(prev => [{ ...payload, date: new Date().toISOString() }, ...prev])
          alert('已记录（仅保存在本地）')
        }
        setExpenseAmount('')
        setExpenseNote('')
      } else {
        alert('记录失败: ' + (j?.error || res.status))
      }
    } catch (err) {
      console.error(err)
      alert('记录请求失败')
    }
  }

  const startSpeech = (isRetry = false) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      const message = '浏览器不支持 Web Speech API，请使用文字输入'
      setSpeechError(message)
      alert(message)
      return
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null
        recognitionRef.current.stop?.()
        recognitionRef.current.abort?.()
      } catch (err) {
        console.warn('停止上一次语音识别失败', err)
      }
    }

    if (speechRetryTimeoutRef.current) {
      clearTimeout(speechRetryTimeoutRef.current)
      speechRetryTimeoutRef.current = null
    }

    if (!isRetry) {
      speechRetryRef.current = 0
      setSpeechError(null)
      speechBufferRef.current = ''
      speechCombinedRef.current = ''
    } else {
      setSpeechError('网络恢复，正在继续语音识别…')
      // 保留已识别文本
      speechCombinedRef.current = (speechCombinedRef.current || transcript || '').trim()
    }
    speechStopReasonRef.current = null

    const rec = new SpeechRecognition()
    recognitionRef.current = rec
    rec.lang = 'zh-CN'
    rec.interimResults = true
    rec.continuous = true
    rec.maxAlternatives = 1
    rec.onstart = () => {
      setIsListening(true)
    }
    rec.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const alternative = result?.[0]
        if (!alternative) continue
        const text = alternative.transcript || ''
        if (result.isFinal) {
          speechBufferRef.current += text
        } else {
          interim += text
        }
      }
      const combined = `${speechBufferRef.current}${interim}`.trim()
      speechCombinedRef.current = combined
      setTranscript(combined)
    }
    rec.onerror = (event: any) => {
      console.error('语音识别错误', event)
      speechStopReasonRef.current = null
      recognitionRef.current = null
      setIsListening(false)
      const errorType = event?.error
      if (errorType === 'aborted') return
      if (errorType === 'network') {
        if (speechRetryRef.current < 2) {
          speechRetryRef.current += 1
          setSpeechError('网络异常导致语音识别中断，稍后将自动重试…')
          if (speechRetryTimeoutRef.current) clearTimeout(speechRetryTimeoutRef.current)
          speechRetryTimeoutRef.current = setTimeout(() => startSpeech(true), 2500)
        } else {
          setSpeechError('语音识别因网络问题多次失败，请检查网络后重试')
        }
        return
      }
      if (errorType === 'no-speech') {
        setSpeechError('未检测到声音，请重试')
      } else if (errorType === 'not-allowed') {
        setSpeechError('麦克风权限被拒绝，请在浏览器中允许访问麦克风')
      } else if (errorType) {
        setSpeechError(`语音识别错误：${errorType}`)
      } else {
        setSpeechError('语音识别发生未知错误，请重试')
      }
    }
    rec.onend = () => {
      setIsListening(false)
      const finalText = (speechBufferRef.current || speechCombinedRef.current).trim()
      if (finalText) {
        setTranscript(finalText)
      } else if (speechStopReasonRef.current !== 'manual') {
        setSpeechError(prev => prev || '未识别到有效语音，请重试')
      }
      recognitionRef.current = null
      speechStopReasonRef.current = null
    }

    try {
      rec.start()
    } catch (err: any) {
      console.error('无法启动语音识别', err)
      recognitionRef.current = null
      speechStopReasonRef.current = null
      setIsListening(false)
      setSpeechError(`无法启动语音识别：${err?.message || err}`)
    }
  }

  const stopSpeech = () => {
    speechStopReasonRef.current = 'manual'
    if (speechRetryTimeoutRef.current) {
      clearTimeout(speechRetryTimeoutRef.current)
      speechRetryTimeoutRef.current = null
    }
    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop?.()
        recognitionRef.current.abort?.()
      }
    } catch (err) {
      console.warn('停止语音识别失败', err)
    } finally {
      recognitionRef.current = null
      setIsListening(false)
      if (speechCombinedRef.current) {
        setTranscript(speechCombinedRef.current.trim())
      }
    }
  }

  const startExpenseSpeech = (isRetry = false) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      const message = '浏览器不支持 Web Speech API，请使用文字输入'
      setExpenseSpeechError(message)
      alert(message)
      return
    }

    if (expenseRecognitionRef.current) {
      try {
        expenseRecognitionRef.current.onresult = null
        expenseRecognitionRef.current.stop?.()
        expenseRecognitionRef.current.abort?.()
      } catch (err) {
        console.warn('停止上一次费用语音识别失败', err)
      }
    }

    if (expenseRetryTimeoutRef.current) {
      clearTimeout(expenseRetryTimeoutRef.current)
      expenseRetryTimeoutRef.current = null
    }

    if (!isRetry) {
      expenseRetryRef.current = 0
      setExpenseSpeechError(null)
      expenseSpeechBufferRef.current = ''
      expenseCombinedRef.current = ''
    } else {
      setExpenseSpeechError('网络恢复，正在继续识别费用备注…')
      expenseCombinedRef.current = (expenseCombinedRef.current || expenseNote || '').trim()
    }
    expenseStopReasonRef.current = null

    const rec = new SpeechRecognition()
    expenseRecognitionRef.current = rec
    rec.lang = 'zh-CN'
    rec.interimResults = true
    rec.continuous = true
    rec.maxAlternatives = 1
    rec.onstart = () => setIsExpenseListening(true)
    rec.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const alternative = result?.[0]
        if (!alternative) continue
        const text = alternative.transcript || ''
        if (result.isFinal) {
          expenseSpeechBufferRef.current += text
        } else {
          interim += text
        }
      }
      const combined = `${expenseSpeechBufferRef.current}${interim}`.trim()
      expenseCombinedRef.current = combined
      setExpenseNote(combined)
    }
    rec.onerror = (event: any) => {
      console.error('费用语音识别错误', event)
      expenseStopReasonRef.current = null
      expenseRecognitionRef.current = null
      setIsExpenseListening(false)
      const errorType = event?.error
      if (errorType === 'aborted') return
      if (errorType === 'network') {
        if (expenseRetryRef.current < 2) {
          expenseRetryRef.current += 1
          setExpenseSpeechError('网络异常导致语音识别中断，稍后将自动重试…')
          if (expenseRetryTimeoutRef.current) clearTimeout(expenseRetryTimeoutRef.current)
          expenseRetryTimeoutRef.current = setTimeout(() => startExpenseSpeech(true), 2500)
        } else {
          setExpenseSpeechError('语音识别因网络问题多次失败，请检查网络后重试')
        }
        return
      }
      if (errorType === 'no-speech') {
        setExpenseSpeechError('未检测到声音，请重试')
      } else if (errorType === 'not-allowed') {
        setExpenseSpeechError('麦克风权限被拒绝，请在浏览器中允许访问麦克风')
      } else if (errorType) {
        setExpenseSpeechError(`语音识别错误：${errorType}`)
      } else {
        setExpenseSpeechError('语音识别发生未知错误，请重试')
      }
    }
    rec.onend = () => {
      setIsExpenseListening(false)
      const finalText = (expenseSpeechBufferRef.current || expenseCombinedRef.current).trim()
      if (finalText) {
        setExpenseNote(finalText)
      } else if (expenseStopReasonRef.current !== 'manual') {
        setExpenseSpeechError(prev => prev || '未识别到有效语音，请重试')
      }
      expenseRecognitionRef.current = null
      expenseStopReasonRef.current = null
    }

    try {
      rec.start()
    } catch (err: any) {
      console.error('无法启动费用语音识别', err)
      expenseRecognitionRef.current = null
      expenseStopReasonRef.current = null
      setIsExpenseListening(false)
      setExpenseSpeechError(`无法启动语音识别：${err?.message || err}`)
    }
  }

  const stopExpenseSpeech = () => {
    expenseStopReasonRef.current = 'manual'
    if (expenseRetryTimeoutRef.current) {
      clearTimeout(expenseRetryTimeoutRef.current)
      expenseRetryTimeoutRef.current = null
    }
    try {
      if (expenseRecognitionRef.current) {
        expenseRecognitionRef.current.stop?.()
        expenseRecognitionRef.current.abort?.()
      }
    } catch (err) {
      console.warn('停止费用语音识别失败', err)
    } finally {
      expenseRecognitionRef.current = null
      setIsExpenseListening(false)
      if (expenseCombinedRef.current) {
        setExpenseNote(expenseCombinedRef.current.trim())
      }
    }
  }

  const submit = async () => {
    setLoading(true)
    setItinerary(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination, days, budget, partySize, preferences, transcript })
      })
      const data = await res.json()
      setItinerary(data.itinerary)
      // display summary and total if provided
      if ((data as any).totalEstimatedCost) setSummary(`预计总花费：${(data as any).totalEstimatedCost} 元`)
      if ((data as any).summary) setRawSummary((data as any).summary)
    } catch (err) {
      console.error(err)
      alert('生成失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <h1>旅行规划 AI（演示）</h1>
      <div style={{ float: 'right' }}>
        <AuthStatus userEmail={userEmail} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 900 }}>
        <div>
          <label>目的地</label>
          <input value={destination} onChange={e => setDestination(e.target.value)} />
        </div>
        <div>
          <label>天数</label>
          <input type="number" value={days} onChange={e => setDays(Number(e.target.value))} />
        </div>
        <div>
          <label>预算（元）</label>
          <input type="number" value={budget} onChange={e => setBudget(Number(e.target.value))} />
        </div>
        <div>
          <label>同行人数</label>
          <input type="number" value={partySize} onChange={e => setPartySize(Number(e.target.value))} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label>偏好</label>
          <input value={preferences} onChange={e => setPreferences(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label>语音输入（或直接在偏好/目的地中编辑）</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => startSpeech()} disabled={isListening}>{isListening ? '正在识别...' : '开始识别'}</button>
            <button onClick={stopSpeech} disabled={!isListening}>停止</button>
            <button onClick={() => setTranscript('')}>清空</button>
            <button onClick={() => startSpeech()} disabled={isListening}>重试</button>
            <span style={{ marginLeft: 8 }}>{isListening ? '🎤 正在录音' : ''}</span>
          </div>
          {speechError && <div style={{ color: '#b91c1c', marginTop: 8 }}>{speechError}</div>}
          <textarea value={transcript} onChange={e => setTranscript(e.target.value)} rows={3} style={{ width: '100%' }} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <button onClick={submit} disabled={loading}>{loading ? '生成中...' : '生成行程'}</button>
        </div>
      </div>

      <hr style={{ margin: '24px 0' }} />

      <div>
        <h2>生成结果</h2>
        {!itinerary && <p>尚无结果</p>}
        {summary && <p><strong>{summary}</strong></p>}
        {rawSummary && <p>{rawSummary}</p>}
        {itinerary && (
          <div
            style={{
              display: 'grid',
              gap: 24,
              alignItems: 'start',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'
            }}
          >
            <section
              style={{
                position: 'relative',
                minHeight: 420,
                background: 'linear-gradient(160deg, #1d4ed8 0%, #22d3ee 100%)',
                borderRadius: 24,
                padding: 16,
                color: '#f8fafc',
                boxShadow: '0 25px 45px rgba(15,23,42,0.2)'
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 14, opacity: 0.85 }}>智能行程地图</div>
                <h3 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0 0' }}>{destination} · {days} 日游</h3>
                <p style={{ fontSize: 13, marginTop: 6, maxWidth: 340, lineHeight: 1.5 }}>
                  地图会自动定位行程中的热门地点，点击标记或右侧卡片可查看详情、切换聚焦。
                </p>
              </div>
              <div style={{
                position: 'relative',
                background: '#0f172a',
                borderRadius: 20,
                padding: 6,
                height: '100%',
                minHeight: 360,
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)'
              }}>
                <ItineraryMap
                  destination={destination}
                  activities={mapActivities}
                  selectedActivityId={selectedActivityId || undefined}
                  onSelectActivity={handleSelectActivity}
                />
              </div>
            </section>

            <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {itinerary.map(day => (
                <div
                  key={day.day}
                  style={{
                    background: '#fff',
                    borderRadius: 24,
                    padding: '22px 24px',
                    boxShadow: '0 20px 45px rgba(15,23,42,0.12)',
                    border: '1px solid rgba(148,163,184,0.2)'
                  }}
                >
                  <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 13, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase' }}>Day {day.day}</div>
                      <h3 style={{ fontSize: 20, margin: '4px 0 0' }}>精品精选行程</h3>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{
                        background: 'rgba(37,99,235,0.1)',
                        color: '#2563eb',
                        borderRadius: 999,
                        padding: '6px 12px',
                        fontSize: 12
                      }}>
                        {day.activities.length} 个体验
                      </span>
                    </div>
                  </header>
                  <div style={{ display: 'grid', gap: 16 }}>
                    {day.activities.map((activity, idx) => {
                      const activityId = `${day.day}-${idx}`
                      const isSelected = selectedActivityId === activityId
                      const imageUrl = buildActivityImageUrl(activity, destination)
                      const externalLink = activity.address ? buildExternalMapLink(activity.address, destination) : null
                      return (
                        <article
                          key={activityId}
                          data-activity-id={activityId}
                          onMouseEnter={() => setSelectedActivityId(activityId)}
                          style={{
                            background: '#ffffff',
                            borderRadius: 20,
                            overflow: 'hidden',
                            border: isSelected ? '2px solid rgba(37,99,235,0.7)' : '1px solid rgba(226,232,240,0.9)',
                            boxShadow: isSelected ? '0 24px 50px rgba(37,99,235,0.18)' : '0 12px 30px rgba(15,23,42,0.08)',
                            transition: 'all 0.25s ease',
                            cursor: externalLink ? 'pointer' : 'default',
                            transform: isSelected ? 'translateY(-3px)' : 'translateY(0)'
                          }}
                          onClick={() => {
                            handleSelectActivity(activityId)
                            if (externalLink) {
                              window.open(externalLink, '_blank')
                            }
                          }}
                        >
                          <div style={{ position: 'relative', width: '100%', height: 200, background: '#e2e8f0' }}>
                            <Image
                              src={imageUrl}
                              alt={`${activity.name} - ${destination}`}
                              fill
                              sizes="(max-width: 768px) 100vw, 420px"
                              style={{ objectFit: 'cover' }}
                            />
                            <div style={{
                              position: 'absolute',
                              left: 12,
                              top: 12,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6
                            }}>
                              <span style={{
                                background: 'rgba(15,23,42,0.65)',
                                color: '#f8fafc',
                                borderRadius: 999,
                                padding: '4px 10px',
                                fontSize: 11,
                                letterSpacing: 1.2,
                                textTransform: 'uppercase'
                              }}>
                                {activity.type}
                              </span>
                              <span style={{
                                background: 'rgba(30,64,175,0.85)',
                                color: 'white',
                                borderRadius: 999,
                                padding: '3px 10px',
                                fontSize: 11
                              }}>
                                {activity.time}
                              </span>
                            </div>
                          </div>
                          <div style={{ padding: '18px 20px 20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                              <div>
                                <h4 style={{ margin: 0, fontSize: 18 }}>{activity.name}</h4>
                                {activity.address && (
                                  <div style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>
                                    {activity.address}
                                  </div>
                                )}
                              </div>
                              {activity.estimatedCost ? (
                                <span style={{
                                  background: 'rgba(16,185,129,0.12)',
                                  color: '#047857',
                                  borderRadius: 12,
                                  padding: '6px 10px',
                                  fontSize: 12,
                                  whiteSpace: 'nowrap'
                                }}>
                                  约 {activity.estimatedCost} 元
                                </span>
                              ) : null}
                            </div>
                            {activity.notes && (
                              <p style={{ marginTop: 12, fontSize: 14, color: '#1f2937', lineHeight: 1.6 }}>{activity.notes}</p>
                            )}
                            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={event => {
                                  event.stopPropagation()
                                  handleSelectActivity(activityId)
                                }}
                                style={{
                                  background: isSelected ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : 'rgba(37,99,235,0.1)',
                                  color: isSelected ? '#f8fafc' : '#2563eb',
                                  border: 'none',
                                  borderRadius: 999,
                                  padding: '8px 16px',
                                  fontSize: 13,
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease'
                                }}
                              >
                                {isSelected ? '已聚焦地图' : '在地图中查看'}
                              </button>
                              {externalLink && (
                                <button
                                  type="button"
                                  onClick={event => {
                                    event.stopPropagation()
                                    window.open(externalLink, '_blank')
                                  }}
                                  style={{
                                    background: 'rgba(15,23,42,0.08)',
                                    color: '#0f172a',
                                    border: 'none',
                                    borderRadius: 999,
                                    padding: '8px 16px',
                                    fontSize: 13,
                                    cursor: 'pointer'
                                  }}
                                >
                                  打开外部地图
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={saveItinerary}
                  style={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 999,
                    padding: '12px 28px',
                    fontSize: 15,
                    cursor: 'pointer',
                    boxShadow: '0 15px 30px rgba(79,70,229,0.35)'
                  }}
                >
                  保存行程至云端
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
      {isLoggedIn && (
        <div style={{ marginTop: 24 }}>
          <h2>我的云端行程</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
            <span>以下为最近保存的行程记录</span>
            <button onClick={() => authToken && loadSavedItineraries(authToken)} disabled={loadingItineraries || !authToken}>
              {loadingItineraries ? '加载中…' : '刷新行程'}
            </button>
          </div>
          {loadingItineraries ? (
            <p>正在加载云端行程…</p>
          ) : savedItineraries.length === 0 ? (
            <p>暂无云端行程记录，生成行程后点击保存即可同步。</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {savedItineraries.map(item => (
                <li key={item.id} style={{ border: '1px solid #e5e7eb', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <strong>{resolveItineraryTitle(item)}</strong>
                      {item.created_at && <span style={{ marginLeft: 8, color: '#666' }}>{new Date(item.created_at).toLocaleString()}</span>}
                    </div>
                    <button onClick={() => applySavedItinerary(item)} disabled={!item.itinerary || !Array.isArray(item.itinerary)}>加载到页面</button>
                  </div>
                  {typeof item.summary === 'string' && item.summary && (
                    <div style={{ marginTop: 8, color: '#444' }}>{item.summary}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <hr style={{ margin: '24px 0' }} />
      <div>
        <h2>费用记录</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div>
            <label>金额（元）</label>
            <input type="number" value={expenseAmount as any} onChange={e => setExpenseAmount(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
          <div>
            <label>分类</label>
            <select value={expenseCategory} onChange={e => setExpenseCategory(e.target.value)}>
              <option>餐饮</option>
              <option>交通</option>
              <option>住宿</option>
              <option>门票</option>
              <option>其他</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>备注</label>
            <input value={expenseNote} onChange={e => setExpenseNote(e.target.value)} style={{ width: '100%' }} />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
              <button type="button" onClick={() => startExpenseSpeech()} disabled={isExpenseListening}>{isExpenseListening ? '识别中...' : '语音录入'}</button>
              <button type="button" onClick={() => stopExpenseSpeech()} disabled={!isExpenseListening}>停止</button>
              {isExpenseListening && <span>🎤</span>}
            </div>
            {expenseSpeechError && <div style={{ color: '#b91c1c', marginTop: 4 }}>{expenseSpeechError}</div>}
          </div>
          <div>
            <button onClick={saveExpense}>记录费用</button>
          </div>
        </div>

        <h3 style={{ marginTop: 12 }}>近期费用</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <span>{isLoggedIn ? '以下展示你在 Supabase 中的费用记录。' : '当前未登录，数据仅保存在本地刷新后会丢失。'}</span>
          {isLoggedIn && (
            <button onClick={() => authToken && loadSavedExpenses(authToken)} disabled={loadingExpenses || !authToken}>
              {loadingExpenses ? '同步中…' : '刷新费用'}
            </button>
          )}
        </div>
        {loadingExpenses ? (
          <p>正在加载费用数据…</p>
        ) : expensesToDisplay.length === 0 ? (
          <p>尚无记录</p>
        ) : (
          <ul>
            {expensesToDisplay.map((ex, idx) => (
              <li key={idx}>{formatExpenseTime(ex)} - {ex.category} - {ex.amount} 元 {ex.note ? `(${ex.note})` : ''}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function AuthStatus({ userEmail }: { userEmail?: string | null }) {
  const [fallbackEmail, setFallbackEmail] = useState<string | null>(null)

  useEffect(() => {
    if (typeof userEmail !== 'undefined') return
    let mounted = true
    ;(async () => {
      const s = await supabase.auth.getSession()
      if (!mounted) return
      setFallbackEmail(s?.data?.session?.user?.email || null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      setFallbackEmail(session?.user?.email || null)
    })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [userEmail])

  const effectiveEmail = typeof userEmail !== 'undefined' ? userEmail : fallbackEmail
  if (effectiveEmail) return (<div>已登录：{effectiveEmail} <a href="/login">(管理)</a></div>)
  return (<div><a href="/login">登录 / 注册</a></div>)
}


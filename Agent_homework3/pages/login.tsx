import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const router = useRouter()

  const signup = async () => {
    setMessage('处理中...')
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) setMessage('注册失败: ' + error.message)
    else setMessage('注册成功，请查收邮件完成验证（如果启用）')
  }

  const signin = async () => {
    setMessage('处理中...')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage('登录失败: ' + error.message)
    else {
      setMessage('登录成功')
      router.push('/')
    }
  }

  const signout = async () => {
    await supabase.auth.signOut()
    setMessage('已登出')
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>登录 / 注册</h1>
      <div style={{ maxWidth: 480 }}>
        <div>
          <label>邮箱</label>
          <input value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <label>密码</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={signin}>登录</button>
          <button onClick={signup} style={{ marginLeft: 8 }}>注册</button>
          <button onClick={signout} style={{ marginLeft: 8 }}>登出</button>
        </div>
        <div style={{ marginTop: 12 }}>{message}</div>
      </div>
    </div>
  )
}

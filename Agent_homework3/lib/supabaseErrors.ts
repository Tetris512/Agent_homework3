export function isTableMissingError(error: any): boolean {
  if (!error) return false
  const code = typeof error.code === 'string' ? error.code.toUpperCase() : ''
  if (code === 'PGRST205') return true
  const message = String(error.message || '').toLowerCase()
  return message.includes("could not find the table")
}

export function tableMissingHint(tableName: string): string {
  return `Supabase 表 ${tableName} 尚未创建或 PostgREST 缓存未刷新，请在 Supabase SQL Editor 执行 supabase_schema.sql 并运行 SELECT pg_notify('pgrst','reload schema');`
}

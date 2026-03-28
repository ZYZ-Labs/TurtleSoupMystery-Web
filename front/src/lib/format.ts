export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '未记录';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatDifficulty(value: 'easy' | 'medium' | 'hard') {
  return {
    easy: '简单',
    medium: '中等',
    hard: '困难'
  }[value];
}

export function formatDuration(value: number | null | undefined) {
  if (!Number.isFinite(value) || Number(value) <= 0) {
    return '0 秒';
  }

  const totalSeconds = Math.max(0, Math.round(Number(value) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours} 小时`);
  }

  if (minutes > 0) {
    parts.push(`${minutes} 分`);
  }

  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds} 秒`);
  }

  return parts.join(' ');
}

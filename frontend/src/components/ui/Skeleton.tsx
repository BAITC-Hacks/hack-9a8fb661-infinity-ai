export function Skeleton({ className = 'h-64' }: { className?: string }) {
  return <div className={`${className} animate-pulse rounded-xl bg-gradient-to-r from-panel-2 via-line/60 to-panel-2`} />
}

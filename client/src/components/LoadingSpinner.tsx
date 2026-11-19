interface LoadingSpinnerProps {
  // Fills the viewport (route guards, before the layout exists); otherwise sits inside <main>.
  fullScreen?: boolean;
}

function LoadingSpinner({ fullScreen = false }: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      className={`flex items-center justify-center ${fullScreen ? "h-dvh bg-neutral-50" : "py-24"}`}
    >
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-800" />
    </div>
  );
}

export default LoadingSpinner;

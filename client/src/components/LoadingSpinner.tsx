interface LoadingSpinnerProps {
  // Fills the viewport (route guards, before the layout exists); otherwise sits inside <main>.
  fullScreen?: boolean;
}

function LoadingSpinner({ fullScreen = false }: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      className={`flex items-center justify-center ${fullScreen ? "h-screen bg-gray-50" : "py-24"}`}
    >
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-100 border-t-orange-500" />
    </div>
  );
}

export default LoadingSpinner;

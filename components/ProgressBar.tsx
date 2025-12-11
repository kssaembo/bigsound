import React from 'react';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ currentTime, duration, onSeek }) => {
  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const calculatePercentage = () => {
    if (!duration || duration === 0) return 0;
    return (currentTime / duration) * 100;
  };

  const percentage = calculatePercentage();
  
  // Create a gradient for the progress fill
  const trackBackground = `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${percentage}%, #DBEAFE ${percentage}%, #DBEAFE 100%)`;

  return (
    <div className="w-full flex flex-col gap-2 select-none">
      {/* Time Labels */}
      <div className="flex justify-between text-sm font-bold text-gray-500 px-1">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Slider */}
      <div className="relative w-full h-8 flex items-center">
         <input
          type="range"
          min="0"
          max={duration || 100}
          step="0.1"
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="progress-slider w-full"
          style={{ 
            background: trackBackground,
            height: '12px',
            borderRadius: '9999px'
          }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
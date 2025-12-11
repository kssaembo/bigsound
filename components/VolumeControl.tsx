import React from 'react';

interface VolumeControlProps {
  volume: number;
  onVolumeChange: (val: number) => void;
}

const VolumeControl: React.FC<VolumeControlProps> = ({ volume, onVolumeChange }) => {
  // Volume usually 0 to 4. 
  // Requested display: 0% to 200%.
  // So we multiply volume (0-4) by 50 to get (0-200).
  const displayPercentage = Math.round(volume * 50);

  // Background gradient calculation for the track
  // Max volume is 4. The visual percentage for the slider fill is (current / max) * 100
  const percentage = (volume / 4) * 100;
  
  // Adjusted gradient colors: Green (normal) -> Yellow (boost) -> Red (Max)
  const trackBackground = `linear-gradient(to right, #4ade80 0%, #facc15 50%, #ef4444 ${percentage}%, #e5e7eb ${percentage}%, #e5e7eb 100%)`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      onVolumeChange(val);
    }
  };

  return (
    <div className="flex flex-col items-center w-full space-y-4 select-none">
      <div className="text-center">
        <h3 className="text-xl font-bold text-gray-700 mb-1">소리 크기</h3>
        <span className={`text-5xl font-black ${displayPercentage > 100 ? 'text-red-500' : 'text-blue-500'}`}>
          {displayPercentage}%
        </span>
      </div>

      <div className="w-full px-2 relative h-16 flex items-center justify-center">
        <input
          type="range"
          min="0"
          max="4"
          step="0.1"
          value={volume}
          onChange={handleChange}
          className="volume-slider w-full"
          style={{ 
            background: trackBackground,
            height: '24px',
            borderRadius: '9999px'
          }}
        />
      </div>
    </div>
  );
};

export default VolumeControl;
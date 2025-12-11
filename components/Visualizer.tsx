import React, { useEffect, useRef } from 'react';
import { audioService } from '../services/audioService';

interface VisualizerProps {
  isPlaying: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderFrame = () => {
      if (!isPlaying) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Draw a flat line or "off" state
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.strokeStyle = '#E5E7EB'; // Gray-200
        ctx.lineWidth = 2;
        ctx.stroke();
        return;
      }

      const data = audioService.getAudioData();
      const bufferLength = data.length;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (data[i] / 255) * canvas.height;

        // Colorful rainbow bars for kids
        const hue = i * 5;
        ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;

        // Rounded bars
        ctx.beginPath();
        ctx.roundRect(x, canvas.height - barHeight, barWidth, barHeight, [5, 5, 0, 0]);
        ctx.fill();

        x += barWidth + 1;
      }

      animationRef.current = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying]);

  return (
    <div className="w-full h-32 bg-white rounded-3xl shadow-inner overflow-hidden border-4 border-yellow-200">
      <canvas 
        ref={canvasRef} 
        width={300} 
        height={120} 
        className="w-full h-full"
      />
    </div>
  );
};

export default Visualizer;
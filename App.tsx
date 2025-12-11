import React, { useState, useEffect, useRef } from 'react';
import { Music, Volume2, Play, Pause, Upload } from 'lucide-react';
import { audioService } from './services/audioService';
import { saveVolume, getSavedVolume } from './services/db';
import VolumeControl from './components/VolumeControl';
import ProgressBar from './components/ProgressBar';

// Declare jsmediatags on window
declare global {
  interface Window {
    jsmediatags: any;
  }
}

const App: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [coverArt, setCoverArt] = useState<string | null>(null);
  
  const audioFileRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const volumeSaveTimeoutRef = useRef<number | null>(null);

  // Load saved volume on start
  useEffect(() => {
    getSavedVolume().then((savedVol) => {
      if (savedVol !== null && !isNaN(savedVol)) {
        // Clamp saved volume to new max 4.0 if it was higher
        const safeVol = Math.min(savedVol, 4.0);
        setVolume(safeVol);
        audioService.setVolume(safeVol);
      }
    });
  }, []);

  // Update volume logic with debounce for DB save
  const handleVolumeChange = (newVolume: number) => {
    if (isNaN(newVolume)) return;
    
    setVolume(newVolume);
    audioService.setVolume(newVolume);

    // Debounce the save operation to prevent UI lag/freezing
    if (volumeSaveTimeoutRef.current) {
      window.clearTimeout(volumeSaveTimeoutRef.current);
    }
    volumeSaveTimeoutRef.current = window.setTimeout(() => {
      saveVolume(newVolume);
    }, 500);
  };

  // Handle Play/Pause Toggle
  const handleTogglePlay = async () => {
    setError(null);

    // Check if file is loaded
    if (!audioFileRef.current || !audioFileRef.current.src) {
      setError("먼저 음악 파일을 선택해주세요!");
      // Trigger file input click for better UX
      if (fileInputRef.current) fileInputRef.current.click();
      return;
    }

    if (isPlaying) {
      // Pause behavior
      audioFileRef.current.pause();
      setIsPlaying(false);
    } else {
      // Play behavior
      try {
        await audioFileRef.current.play();
        // Ensure the audio service graph is connected
        await audioService.startFile(audioFileRef.current);
        audioService.setVolume(volume); // Re-apply volume just in case
        setIsPlaying(true);
      } catch (err: any) {
        console.error(err);
        setError("오디오를 재생할 수 없어요. 파일을 확인해주세요.");
        setIsPlaying(false);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && audioFileRef.current) {
      const url = URL.createObjectURL(file);
      audioFileRef.current.src = url;
      setFileName(file.name);
      setError(null);
      setCurrentTime(0);
      setDuration(0);
      setCoverArt(null); // Reset art for new file

      // Attempt to read ID3 tags for cover art
      if (window.jsmediatags) {
        window.jsmediatags.read(file, {
          onSuccess: (tag: any) => {
            const picture = tag.tags.picture;
            if (picture) {
              const { data, format } = picture;
              let base64String = "";
              for (let i = 0; i < data.length; i++) {
                base64String += String.fromCharCode(data[i]);
              }
              const base64 = `data:${format};base64,${window.btoa(base64String)}`;
              setCoverArt(base64);
            }
          },
          onError: (error: any) => {
            console.log("Error reading tags:", error);
          }
        });
      }
      
      // Stop current playback if any
      audioFileRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    if (audioFileRef.current) {
      setCurrentTime(audioFileRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioFileRef.current) {
      setDuration(audioFileRef.current.duration);
    }
  };

  const handleSeek = (time: number) => {
    if (audioFileRef.current) {
      // If we are seeking, we update the audio element immediately
      audioFileRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    // Optionally reset seek to 0 visually handled by currentTime
  };

  return (
    <div className="min-h-screen bg-yellow-50 flex flex-col items-center p-4 md:p-8 w-full mx-auto relative overflow-hidden transition-all duration-300">
      
      {/* Background Decor */}
      <div className="absolute top-[-50px] right-[-50px] w-40 h-40 bg-yellow-300 rounded-full opacity-50 z-0 blur-xl"></div>
      <div className="absolute bottom-[-50px] left-[-50px] w-60 h-60 bg-blue-200 rounded-full opacity-50 z-0 blur-xl"></div>

      {/* Header */}
      <header className="z-10 w-full flex justify-between items-center mb-6 mt-2 max-w-[95%] mx-auto">
        <div className="flex items-center gap-2">
          <div className="bg-orange-500 p-2 rounded-xl shadow-lg">
             <Volume2 className="text-white w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-gray-800 tracking-tight">슈퍼 음량</h1>
        </div>
        <div className="text-xs bg-white px-3 py-1 rounded-full shadow-sm text-gray-500 font-bold">
          v1.9
        </div>
      </header>

      {/* Main Card - Adjusted for full width in tablet/landscape */}
      <main className="z-10 w-full md:w-[95%] landscape:w-[95%] max-w-md md:max-w-none landscape:max-w-none bg-white/80 backdrop-blur-sm rounded-[2rem] shadow-xl p-6 border-2 border-white flex-1 flex flex-col justify-center">
        
        {/* Responsive Layout Grid: Stacks on mobile, Side-by-side on tablet/landscape */}
        <div className="flex flex-col md:flex-row landscape:flex-row gap-8 md:gap-12 h-full">
          
          {/* Left Column: File Input & Progress */}
          <div className="flex-1 flex flex-col gap-6 justify-center">
            {/* File Select Area */}
            <div 
              className={`relative overflow-hidden p-6 md:p-10 rounded-3xl border-2 transition-all duration-500 flex flex-col justify-center flex-grow min-h-[200px] ${coverArt ? 'border-transparent' : 'bg-blue-50 border-blue-100 hover:bg-blue-100'}`}
            >
                {/* Dynamic Background Layer */}
                {coverArt && (
                  <>
                    <div 
                      className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-700 hover:scale-105" 
                      style={{ backgroundImage: `url(${coverArt})` }} 
                    />
                    <div className="absolute inset-0 z-0 bg-black/60 backdrop-blur-[2px]" />
                  </>
                )}

                <input 
                  type="file" 
                  accept="audio/*" 
                  onChange={handleFileChange}
                  ref={fileInputRef}
                  className="hidden"
                  id="audio-upload"
                />
                <label 
                  htmlFor="audio-upload"
                  className={`relative z-10 cursor-pointer flex flex-col items-center justify-center gap-4 font-bold w-full h-full ${coverArt ? 'text-white' : 'text-blue-600'}`}
                >
                  <div className={`p-5 rounded-full shadow-md transition-colors ${coverArt ? 'bg-white/20 text-white backdrop-blur-md' : 'bg-white text-blue-500'}`}>
                    {fileName ? <Music size={40} /> : <Upload size={40} />}
                  </div>
                  <div className="flex flex-col gap-1 items-center">
                    <span className="text-2xl drop-shadow-md">{fileName ? "파일 변경하기" : "음악 파일 선택하기"}</span>
                    {fileName ? (
                      <span className={`text-sm mt-1 truncate max-w-[250px] mx-auto ${coverArt ? 'text-gray-200' : 'text-blue-400'}`}>
                        {fileName}
                      </span>
                    ) : (
                       <span className={`text-sm mt-1 font-medium ${coverArt ? 'text-gray-300' : 'text-blue-400'}`}>
                         지원 형식: MP3, WAV, OGG, M4A, FLAC
                       </span>
                    )}
                  </div>
                </label>
                <audio 
                  ref={audioFileRef} 
                  className="hidden" 
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={handleEnded}
                />
            </div>

            {/* Progress Bar - Only Show if File Loaded */}
            {fileName && (
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                <ProgressBar 
                  currentTime={currentTime} 
                  duration={duration} 
                  onSeek={handleSeek} 
                />
              </div>
            )}
          </div>

          {/* Right Column: Volume & Controls */}
          <div className="flex-1 flex flex-col gap-6 justify-center">
            {/* Volume Control */}
            <div className="bg-gray-50 rounded-3xl p-8 shadow-inner flex flex-col justify-center">
               <VolumeControl volume={volume} onVolumeChange={handleVolumeChange} />
            </div>

            {/* Play/Pause Button */}
            <button
              onClick={handleTogglePlay}
              disabled={!fileName}
              className={`w-full py-8 rounded-3xl text-3xl font-black text-white shadow-lg transform transition-transform active:scale-95 flex items-center justify-center gap-4 ${
                !fileName 
                  ? 'bg-gray-300 shadow-none cursor-not-allowed'
                  : isPlaying 
                    ? 'bg-yellow-400 shadow-yellow-200 hover:bg-yellow-500' 
                    : 'bg-green-500 shadow-green-200 hover:bg-green-600'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause size={40} fill="currentColor" />
                  일시정지
                </>
              ) : (
                <>
                  <Play size={40} fill="currentColor" />
                  재생
                </>
              )}
            </button>
          </div>

        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-6 bg-red-100 text-red-600 p-4 rounded-2xl text-center font-bold border-2 border-red-200 animate-bounce">
            {error}
          </div>
        )}

      </main>

      {/* Footer Info */}
      <footer className="mt-6 mb-2 text-center opacity-60">
        <p className="text-sm text-gray-500 font-bold mb-1">
          오프라인에서도 사용할 수 있어요! 🚀
        </p>
        <p className="text-xs text-gray-400">
          ⓒ 2025. Kwon's class. All rights reserved.
        </p>
      </footer>
    </div>
  );
};

export default App;
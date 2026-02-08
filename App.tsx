
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { 
  ReferenceImage, 
  LoadingStep, 
  calculateBaseSizeScore, 
  calculateProximityWeight,
  AppSettings
} from './types';
import { geminiService } from './services/geminiService';
import ImageCard from './components/ImageCard';

const App: React.FC = () => {
  const [images, setImages] = useState<ReferenceImage[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingStep, setLoadingStep] = useState<LoadingStep>(LoadingStep.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [genSize, setGenSize] = useState<number>(400); 
  const [settings, setSettings] = useState<AppSettings>({ 
    model: 'gemini-2.5-flash-image',
    aspectRatio: '1:1',
    influenceRadius: 1000 
  });
  const [apiKey, setApiKey] = useState<string>(process.env.NEXT_PUBLIC_GEMINI_API_KEY || "");
  
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.8 });
  const [isPanning, setIsPanning] = useState(false);
  const [isOverBoard, setIsOverBoard] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const [history, setHistory] = useState<ReferenceImage[][]>([]);
  const [contextMenu, setContextMenu] = useState<{ 
    x: number, 
    y: number, 
    canvasX: number, 
    canvasY: number,
    targetImageId?: string 
  } | null>(null);

  // 初期状態をfalseにする
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // APIキーの選択状態をチェックする
  const checkKey = useCallback(async () => {
    try {
      if (typeof (window as any).aistudio?.hasSelectedApiKey === 'function') {
        const has = await (window as any).aistudio.hasSelectedApiKey();
        setHasKey(has);
      } else {
        // AI Studio環境以外（ローカル開発など）では、環境変数があれば許可するなどのフォールバックが必要な場合もありますが、
        // 今回は「必ずセットさせる」という要件に従い、APIが存在しない場合はキーなしとして扱います。
        setHasKey(false);
      }
    } catch (e) {
      console.error("Key check failed", e);
      setHasKey(false);
    } finally {
      setIsInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    // 起動時にキーチェックを実行
    checkKey();
  }, [checkKey]);


  const handleOpenKeySelection = async () => {
    // ブラウザの入力ダイアログを表示
    const userKey = window.prompt("Gemini APIキーを入力してください（sk-...）");
    
    if (userKey) {
      setApiKey(userKey); // ★ここを追加：入力されたキーをStateに保存
      setHasKey(true);
      setError(null);
    }
  };

  const downloadImage = (id: string) => {
    const img = images.find(i => i.id === id);
    if (!img || !img.base64) return;
    
    const link = document.createElement('a');
    link.href = img.base64;
    link.download = `synth-${id.slice(0, 8)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setContextMenu(null);
  };

  const saveToHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-19), [...images]]);
  }, [images]);

  const selectedImage = useMemo(() => {
    if (selectedIds.size === 1) {
      const id = Array.from(selectedIds)[0];
      return images.find(img => img.id === id);
    }
    return null;
  }, [selectedIds, images]);

  const processFiles = async (files: File[], startX: number, startY: number) => {
    saveToHistory();
    const newImages: ReferenceImage[] = await Promise.all(
      files.map((file, index) => {
        return new Promise<ReferenceImage>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const img = new Image();
            img.onload = () => {
              const baseWidth = 200;
              const ratio = img.height / img.width;
              resolve({
                id: uuidv4(),
                file,
                base64: reader.result as string,
                x: startX + (index * 30),
                y: startY + (index * 30),
                width: baseWidth,
                height: baseWidth * ratio,
              });
            };
            img.src = reader.result as string;
          };
          reader.readAsDataURL(file);
        });
      })
    );
    setImages((prev) => [...prev, ...newImages]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOverBoard(false);
    const files = (Array.from(e.dataTransfer.files) as File[]).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left - transform.x) / transform.scale - 100;
    const y = (e.clientY - rect.top - transform.y) / transform.scale - 100;
    processFiles(files, x, y);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scaleFactor = 1 - e.deltaY * 0.001;
    const newScale = Math.min(5, Math.max(0.05, transform.scale * scaleFactor));
    const rect = boardRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const newX = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
      const newY = mouseY - (mouseY - transform.y) * (newScale / transform.scale);
      setTransform({ x: newX, y: newY, scale: newScale });
    }
  };

  const handleBoardMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    if (isPanning) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleBoardMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !e.altKey) {
      if (!(e.target as HTMLElement).closest('.image-card') && !(e.target as HTMLElement).closest('.hud-element')) {
        setSelectedIds(new Set());
      }
    }
    if (e.button === 1 || (e.button === 0 && (e.altKey || !(e.target as HTMLElement).closest('.image-card')))) {
      if (!(e.target as HTMLElement).closest('.hud-element')) {
        setIsPanning(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    }
    if (contextMenu) setContextMenu(null);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
    const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
    
    const target = e.target as HTMLElement;
    const card = target.closest('.image-card');
    const targetImageId = card?.getAttribute('data-id') || undefined;
    
    setContextMenu({ 
      x: e.clientX, 
      y: e.clientY, 
      canvasX, 
      canvasY,
      targetImageId
    });
  };

  const synthesizeAtPos = async (posX: number, posY: number, size: number) => {
    // 実行直前にもチェック
    if (!hasKey) {
      setError("Please connect your API key to synthesize.");
      handleOpenKeySelection();
      return;
    }

    setLoadingStep(LoadingStep.ANALYZING);
    setError(null);
    setContextMenu(null);

    const width = size;
    let height = size;
    if (settings.aspectRatio === '16:9') height = size * (9/16);
    if (settings.aspectRatio === '9:16') height = size * (16/9);
    if (settings.aspectRatio === '4:3') height = size * (3/4);

    const targetCenterX = posX + width / 2;
    const targetCenterY = posY + height / 2;

    const scoredImages = images
      .filter(img => !img.isGenerating)
      .map(img => {
        const sizeScore = calculateBaseSizeScore(img.width, img.height);
        const proxWeight = calculateProximityWeight(img.x, img.y, img.width, img.height, targetCenterX, targetCenterY, settings.influenceRadius);
        const combinedScore = sizeScore * proxWeight * 2;
        return {
          ...img,
          score: Math.max(0, Math.min(10, combinedScore)),
          rawWeight: sizeScore * proxWeight
        };
      })
      .filter(img => (img.score || 0) > 0); 

    if (scoredImages.length === 0) {
      setError("Synthesis field is empty. Move reference images closer to the synthesis target.");
      setLoadingStep(LoadingStep.IDLE);
      return;
    }

    const totalRawWeight = scoredImages.reduce((sum, img) => sum + img.rawWeight, 0);
    const synthesisSources = scoredImages.map(img => ({
      thumbnail: img.base64,
      contribution: Math.round((img.rawWeight / totalRawWeight) * 100)
    })).sort((a, b) => b.contribution - a.contribution);

    const genId = uuidv4();
    const placeholder: ReferenceImage = {
      id: genId,
      base64: '',
      x: posX,
      y: posY,
      width,
      height,
      isGenerating: true
    };
    
    setImages(prev => [...prev, placeholder]);

    try {
      // 内部で毎回GoogleGenAIをインスタンス化
      const prompt = await geminiService.generateSynthesisPrompt(scoredImages,apiKey);
      setLoadingStep(LoadingStep.GENERATING);
      const imageUrl = await geminiService.generateImage(prompt, settings.model, settings.aspectRatio, apiKey);
      
      setImages(prev => prev.map(img => img.id === genId ? { 
        ...img, 
        base64: imageUrl, 
        isGenerating: false,
        synthesisData: {
          prompt,
          sources: synthesisSources
        }
      } : img));
      setLoadingStep(LoadingStep.COMPLETED);
    } catch (err: any) {
      // エンティティが見つからないエラーはキーの問題であることが多い
      if (err.message?.includes("Requested entity was not found") || err.message?.includes("API_KEY")) {
        setError("API Key verification failed. Please re-select a valid paid project key.");
        setHasKey(false);
      } else {
        setError(err.message || "Synthesis failed.");
      }
      setImages(prev => prev.filter(img => img.id !== genId));
      setLoadingStep(LoadingStep.ERROR);
    }
  };
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    // { passive: false } を指定することで e.preventDefault() が効くようになる
    board.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      board.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && e.key.toLowerCase() === 'z') {
        if (history.length > 0) {
          const last = history[history.length - 1];
          setImages(last);
          setHistory(prev => prev.slice(0, -1));
        }
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedIds.size > 0 && !(e.target instanceof HTMLInputElement)) {
          saveToHistory();
          setImages(prev => prev.filter(img => !selectedIds.has(img.id)));
          setSelectedIds(new Set<string>());
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images, selectedIds, history, saveToHistory]);

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsPanning(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const updatePosition = useCallback((id: string, x: number, y: number) => {
    setImages((prev) => prev.map((img) => img.id === id ? { ...img, x, y } : img));
  }, []);

  const updateSize = useCallback((id: string, width: number, height: number) => {
    setImages((prev) => prev.map((img) => img.id === id ? { ...img, width, height } : img));
  }, []);

  const bringToFront = useCallback((id: string) => {
    setImages((prev) => {
      const idx = prev.findIndex(img => img.id === id);
      if (idx === -1) return prev;
      const newArr = [...prev];
      const [item] = newArr.splice(idx, 1);
      newArr.push(item);
      return newArr;
    });
  }, []);

  const handleSelect = useCallback((id: string, multi: boolean) => {
    setSelectedIds((prev: Set<string>) => {
      const next = multi ? new Set<string>(prev) : new Set<string>();
      if (next.has(id) && multi) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const gridLineColor = 'rgba(99, 102, 241, 0.2)';
  const influenceX = contextMenu ? contextMenu.x : mousePos.x;
  const influenceY = contextMenu ? contextMenu.y : mousePos.y;

  if (isInitialLoading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Initializing Engine</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      
      {/* API Key Connection Overlay - Mandatory bypass env */}
      {!hasKey && (
        <div className="fixed inset-0 z-[1000] bg-slate-950 flex items-center justify-center p-6 animate-in fade-in duration-700">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15)_0%,transparent_70%)]"></div>
          <div className="relative max-w-md w-full bg-slate-900 border border-indigo-500/30 rounded-[2.5rem] p-12 shadow-[0_0_100px_rgba(99,102,241,0.2)] text-center flex flex-col items-center gap-10">
            <div className="w-28 h-28 bg-indigo-600/20 rounded-[3rem] flex items-center justify-center text-indigo-400 shadow-inner group transition-transform hover:scale-110 duration-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div className="space-y-4">
              <h2 className="text-4xl font-heading font-black tracking-tighter text-white uppercase leading-none">ResonaCanvas</h2>
              <div className="h-1 w-16 bg-indigo-500 mx-auto rounded-full"></div>
              <p className="text-slate-400 text-sm leading-relaxed max-w-[300px] mx-auto font-medium">
                Authentication Required. Please connect your Gemini API key to manifest visual fusions.
              </p>
            </div>
            <button 
              onClick={handleOpenKeySelection}
              className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-widest rounded-3xl transition-all shadow-2xl hover:shadow-indigo-500/40 active:scale-95 flex items-center justify-center gap-4"
            >
              Connect API Key
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            <div className="flex flex-col gap-3">
              <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-2 justify-center font-bold"
              >
                Learn about paid project keys
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            </div>
          </div>
        </div>
      )}
      
      {/* App Title Display */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[40] pointer-events-none select-none">
        <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 px-8 py-3 rounded-2xl shadow-2xl">
          <h1 className="text-sm font-heading font-black tracking-widest uppercase text-white/90">
            ResonaCanvas
          </h1>
        </div>
      </div>

      {/* Main HUD Controls */}
      <div className="absolute top-6 right-6 z-50 flex gap-2 hud-element">
        <button 
          onClick={(e) => { e.stopPropagation(); setShowSettings(true); }}
          className="p-3 bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-xl text-white hover:bg-white/10 transition-colors shadow-2xl"
          title="Engine Config"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" />
          </svg>
        </button>
      </div>

      <main 
        ref={boardRef}
        className={`flex-1 relative overflow-hidden outline-none transition-colors duration-500 ${isOverBoard ? 'bg-indigo-950/20' : 'bg-slate-950'}`}
        onWheel={handleWheel}
        onMouseMove={handleBoardMouseMove}
        onMouseDown={handleBoardMouseDown}
        onContextMenu={handleContextMenu}
        onDragOver={(e) => { e.preventDefault(); setIsOverBoard(true); }}
        onDragLeave={() => setIsOverBoard(false)}
        onDrop={handleDrop}
      >
        {/* Synthesis Influence Field */}
        <div 
          className="fixed pointer-events-none z-10"
          style={{ 
            left: influenceX, 
            top: influenceY,
            width: `${settings.influenceRadius * 2 * transform.scale}px`,
            height: `${settings.influenceRadius * 2 * transform.scale}px`,
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle, rgba(239, 68, 68, 0.45) 0%, rgba(234, 179, 8, 0.2) 35%, rgba(34, 197, 94, 0.15) 60%, transparent 75%)',
            border: '2px dashed rgba(239, 68, 68, 0.25)',
            borderRadius: '100%',
            opacity: isPanning ? 0 : 1,
            transition: contextMenu ? 'none' : 'opacity 0.2s ease-out',
            boxShadow: 'inset 0 0 60px rgba(239, 68, 68, 0.15)'
          }}
        >
          <div className="absolute inset-0 border border-green-500/25 rounded-full"></div>
        </div>

        {/* Dynamic Grid */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{ 
            backgroundImage: `radial-gradient(circle at 1px 1px, ${gridLineColor} 1px, transparent 0)`,
            backgroundSize: `${40 * transform.scale}px ${40 * transform.scale}px`,
            backgroundPosition: `${transform.x}px ${transform.y}px`,
          }}
        ></div>

        <div 
          style={{ 
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: '0 0'
          }}
          className="absolute inset-0 pointer-events-none"
        >
          <div className="pointer-events-auto">
            {images.map((img) => (
              <ImageCard 
                key={img.id}
                item={img}
                isSelected={selectedIds.has(img.id)}
                onUpdatePosition={updatePosition}
                onUpdateSize={updateSize}
                onRemove={(id) => {
                  saveToHistory();
                  setImages(prev => prev.filter(i => i.id !== id));
                }}
                onSelect={handleSelect}
                onBringToFront={bringToFront}
                zoom={transform.scale}
              />
            ))}
          </div>
        </div>

        {/* Floating Controls with Enhanced Slider Aesthetics */}
        <div className="absolute bottom-6 left-6 z-50 flex flex-col gap-4 hud-element">
          <div className="bg-slate-900/90 backdrop-blur-2xl border border-white/10 px-5 py-5 rounded-2xl shadow-2xl flex flex-col gap-5 min-w-[320px]">
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <span>Viewport Zoom</span>
                <span className="text-indigo-400 font-mono">{Math.round(transform.scale * 100)}%</span>
              </div>
              <div className="relative h-2 flex items-center">
                <div className="absolute left-0 right-0 h-0.5 bg-indigo-500/20 rounded-full"></div>
                <div className="absolute left-0 right-0 h-4 flex justify-between pointer-events-none px-1">
                   {[0,1,2,3,4,5].map(i => <div key={i} className="w-px h-full bg-white/10"></div>)}
                </div>
                <input 
                  type="range" min="0.1" max="2" step="0.01" value={transform.scale}
                  onMouseDown={(e) => e.stopPropagation()} 
                  onChange={(e) => {
                    const newScale = parseFloat(e.target.value);
                    const rect = boardRef.current?.getBoundingClientRect();
                    if (rect) {
                      const cx = rect.width / 2; const cy = rect.height / 2;
                      const newX = cx - (cx - transform.x) * (newScale / transform.scale);
                      const newY = cy - (cy - transform.y) * (newScale / transform.scale);
                      setTransform({ x: newX, y: newY, scale: newScale });
                    }
                  }}
                  className="w-full h-2 bg-transparent appearance-none cursor-pointer accent-indigo-500 relative z-10"
                />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <span>Influence Radius</span>
                <span className="text-red-400 font-mono">{Math.round(settings.influenceRadius)}px</span>
              </div>
              <div className="relative h-2 flex items-center">
                <div className="absolute left-0 right-0 h-0.5 bg-red-500/20 rounded-full"></div>
                <div className="absolute left-0 right-0 h-4 flex justify-between pointer-events-none px-1">
                   {[0,1,2,3,4,5].map(i => <div key={i} className="w-px h-full bg-white/10"></div>)}
                </div>
                <input 
                  type="range" min="300" max="3000" step="50" value={settings.influenceRadius}
                  onMouseDown={(e) => e.stopPropagation()} 
                  onChange={(e) => setSettings({ ...settings, influenceRadius: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-transparent appearance-none cursor-pointer accent-red-500 relative z-10"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Loading HUD */}
        {(loadingStep === LoadingStep.ANALYZING || loadingStep === LoadingStep.GENERATING) && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-3 bg-slate-900/95 backdrop-blur-2xl border border-indigo-500/30 px-6 py-3 rounded-2xl shadow-2xl">
            <div className="h-4 w-4 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 animate-pulse">
               {loadingStep === LoadingStep.ANALYZING ? "Processing Concepts" : "Synthesizing Artifact"}
            </span>
          </div>
        )}
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300 hud-element" onClick={() => setShowSettings(false)}>
          <div className="relative w-full max-w-md bg-slate-900 border border-white/5 rounded-3xl shadow-2xl p-8" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowSettings(false)} className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="text-xl font-heading font-black mb-8 uppercase tracking-widest text-indigo-400">Engine Config</h3>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Generation Model</label>
                <div className="grid grid-cols-1 gap-2">
                  <button 
                    onClick={() => setSettings({ ...settings, model: 'gemini-2.5-flash-image' })}
                    className={`text-left px-4 py-3 rounded-xl border transition-all ${settings.model === 'gemini-2.5-flash-image' ? 'bg-indigo-600 border-indigo-400' : 'bg-slate-800 border-white/5 hover:bg-slate-700'}`}
                  >
                    <div className="text-sm font-bold">Gemini 2.5 Flash</div>
                    <div className="text-[10px] opacity-60">High-speed creative synthesis.</div>
                  </button>
                  <button 
                    onClick={() => setSettings({ ...settings, model: 'gemini-3-pro-image-preview' })}
                    className={`text-left px-4 py-3 rounded-xl border transition-all ${settings.model === 'gemini-3-pro-image-preview' ? 'bg-indigo-600 border-indigo-400' : 'bg-slate-800 border-white/5 hover:bg-slate-700'}`}
                  >
                    <div className="text-sm font-bold flex items-center gap-2">
                      Gemini 3 Pro
                    </div>
                    <div className="text-[10px] opacity-60">High-fidelity concept fusion.</div>
                  </button>
                  <button 
                    onClick={() => setSettings({ ...settings, model: 'imagen-4.0-generate-001' })}
                    className={`text-left px-4 py-3 rounded-xl border transition-all ${settings.model === 'imagen-4.0-generate-001' ? 'bg-indigo-600 border-indigo-400' : 'bg-slate-800 border-white/5 hover:bg-slate-700'}`}
                  >
                    <div className="text-sm font-bold flex items-center gap-2">
                      Imagen 4 (Premium)
                    </div>
                    <div className="text-[10px] opacity-60">Studio-grade photorealism & art.</div>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Aspect Ratio</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['1:1', '4:3', '16:9', '9:16'] as const).map((ratio) => (
                    <button 
                      key={ratio}
                      onClick={() => setSettings({ ...settings, aspectRatio: ratio })}
                      className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${settings.aspectRatio === ratio ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-white/5 text-slate-400'}`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="h-px bg-white/5"></div>
              
              <div>
                <button 
                  onClick={handleOpenKeySelection}
                  className="w-full flex items-center justify-between px-4 py-3 bg-indigo-600/10 border border-indigo-500/30 rounded-xl text-indigo-400 text-sm font-bold hover:bg-indigo-600/20 transition-all"
                >
                  Change Connected Key
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </button>
                <p className="mt-2 text-[10px] text-slate-500 px-1">
                  Securely switch your Gemini API key through the platform dialog.
                </p>
              </div>
            </div>
            <div className="mt-10">
              <button 
                onClick={() => setShowSettings(false)}
                className="w-full py-3 bg-white text-slate-950 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-colors shadow-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-[300] bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 min-w-[220px] animate-in fade-in zoom-in-95 duration-100"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-2 text-[10px] font-black uppercase text-slate-500 border-b border-white/5 mb-1">
            {contextMenu.targetImageId ? 'Image Actions' : 'Synthesis Target'}
          </div>
          
          {contextMenu.targetImageId ? (
            <>
              <button 
                onClick={() => downloadImage(contextMenu.targetImageId!)}
                className="w-full text-left px-4 py-3 text-xs font-bold hover:bg-emerald-600 transition-colors flex items-center gap-3 group"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export Artifact
              </button>
              <div className="h-px bg-white/5 my-1"></div>
              <button 
                onClick={() => {
                  saveToHistory();
                  setImages(prev => prev.filter(i => i.id !== contextMenu.targetImageId));
                  setContextMenu(null);
                }}
                className="w-full text-left px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-600 hover:text-white transition-colors"
              >
                Dissolve Node
              </button>
            </>
          ) : (
            <>
              <div className="px-4 py-2 flex flex-col gap-2">
                <div className="grid grid-cols-4 gap-1">
                  {[200, 400, 600, 800].map((size) => (
                    <button 
                      key={size}
                      onClick={() => setGenSize(size)}
                      className={`text-[9px] font-bold py-1.5 rounded transition-all border ${genSize === size ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-white/5 text-slate-400 hover:bg-slate-700'}`}
                    >
                      {size === 200 ? 'S' : size === 400 ? 'M' : size === 600 ? 'L' : 'XL'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-px bg-white/5 my-1"></div>
              <button 
                onClick={() => {
                  const height = genSize * (settings.aspectRatio === '16:9' ? 9/16 : settings.aspectRatio === '9:16' ? 16/9 : settings.aspectRatio === '4:3' ? 3/4 : 1);
                  synthesizeAtPos(contextMenu.canvasX - genSize/2, contextMenu.canvasY - height/2, genSize);
                }}
                className="w-full text-left px-4 py-3 text-xs font-bold hover:bg-indigo-600 transition-colors flex items-center gap-3 group"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Create Image
              </button>
            </>
          )}
        </div>
      )}

      {/* Selected Node Details */}
      {selectedImage && (
        <div className="fixed top-24 right-8 z-[150] w-80 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-6 animate-in slide-in-from-right-4 duration-500 hud-element overflow-y-auto max-h-[80vh] custom-scrollbar">
          <div className="flex flex-col gap-6">
             <div className="aspect-square bg-slate-950 rounded-xl border border-white/10 overflow-hidden shadow-inner flex items-center justify-center">
               <img src={selectedImage.base64} className="w-full h-full object-contain" alt="Manifestation" />
             </div>

             {selectedImage.synthesisData && (
               <div className="flex flex-col gap-4">
                 <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Synth Breakdown</h4>
                 <div className="space-y-3">
                   {selectedImage.synthesisData.sources.map((item, idx) => (
                     <div key={idx} className="flex items-center gap-3 bg-slate-950/50 p-2 rounded-lg border border-white/5">
                       <div className="w-10 h-10 rounded border border-white/10 overflow-hidden flex-shrink-0">
                         <img src={item.thumbnail} className="w-full h-full object-cover" alt="Ref" />
                       </div>
                       <div className="flex-1 min-w-0">
                         <div className="flex justify-between items-center mb-1">
                           <span className="text-[9px] font-black text-indigo-400">{item.contribution}% Influence</span>
                         </div>
                         <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                           <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${item.contribution}%` }}></div>
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
             )}
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-8 right-8 z-[200] animate-in slide-in-from-bottom-8 duration-300 hud-element">
          <div className="flex items-center gap-4 bg-red-900/50 backdrop-blur-2xl border border-red-500/40 p-4 rounded-2xl shadow-2xl">
            <div className="w-8 h-8 bg-red-500/30 rounded-lg flex items-center justify-center text-red-500 shrink-0">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-red-100 text-[11px] leading-snug">{error}</p>
            <button onClick={() => setError(null)} className="text-white/30 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .hud-element { pointer-events: auto !important; }
        
        /* Custom Slider Styling */
        input[type=range] { 
          -webkit-appearance: none; 
          background: transparent; 
        }
        
        input[type=range]::-webkit-slider-thumb { 
          -webkit-appearance: none; 
          height: 14px; 
          width: 14px; 
          border-radius: 50%; 
          background: white; 
          cursor: pointer; 
          border: 2px solid currentColor; 
          box-shadow: 0 0 8px rgba(0,0,0,0.5);
          margin-top: -6px; 
        }
        
        input[type=range]::-moz-range-thumb { 
          height: 14px; 
          width: 14px; 
          border-radius: 50%; 
          background: white; 
          cursor: pointer; 
          border: 2px solid currentColor; 
          box-shadow: 0 0 8px rgba(0,0,0,0.5);
        }
      `}</style>
    </div>
  );
};

export default App;

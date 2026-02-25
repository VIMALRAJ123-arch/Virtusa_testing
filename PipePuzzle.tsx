/**
 * PipePuzzle.tsx — Complete pipe puzzle game in a single file.
 * Contains: Types, API client, Tile, Grid, Controls, PathfinderGame,
 *           Proctoring, AssessmentFlow.
 *
 * Usage:  import { PipePuzzle } from './components/PipePuzzle';
 *         <PipePuzzle />
 */
import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';

// ╔══════════════════════════════════════════════════════╗
// ║                      TYPES                           ║
// ╚══════════════════════════════════════════════════════╝

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type TileType = 'STRAIGHT' | 'CORNER' | 'EMPTY';
type GameStatus = 'PLAYING' | 'ANIMATING' | 'WON' | 'LOST';

interface TileState {
    id: string;
    row: number;
    col: number;
    type: TileType;
    openings: Direction[];
}

interface EntryExit {
    row: number;
    col: number;
    direction: Direction;
}

interface Position {
    row: number;
    col: number;
}

type GridState = TileState[][];

interface GameState {
    grid: GridState;
    start: EntryExit;
    end: EntryExit;
    status: GameStatus;
    selectedTile: Position | null;
    timeRemaining: number;
    attempts: number;
    moves: number;
    rotations: number;
    flips: number;
}

interface LevelStats {
    moves: number;
    rotations: number;
    flips: number;
    time: number;
}

interface LevelResult extends LevelStats {
    level: number;
    success: boolean;
}

// ╔══════════════════════════════════════════════════════╗
// ║                    API CLIENT                        ║
// ╚══════════════════════════════════════════════════════╝

const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers as Record<string, string> },
        ...options,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || 'API error');
    }
    return res.json();
}

interface ApiTile {
    id: string;
    row: number;
    col: number;
    type: TileType;
    openings: Direction[];
}

interface GameStartResponse {
    session_id: string;
    grid: ApiTile[][];
    start: EntryExit;
    end: EntryExit;
    status: string;
}

interface GridResponse {
    grid: ApiTile[][];
    rotations?: number;
    flips?: number;
}

interface PathCell {
    row: number;
    col: number;
}

interface SubmitResponse {
    valid: boolean;
    status: string;
    path: PathCell[];
}


const api = {
    startGame: (rows: number, cols: number): Promise<GameStartResponse> =>
        request<GameStartResponse>('/game/start', { method: 'POST', body: JSON.stringify({ rows, cols }) }),

    rotateTile: (sessionId: string, row: number, col: number): Promise<GridResponse> =>
        request<GridResponse>(`/game/${sessionId}/rotate`, { method: 'POST', body: JSON.stringify({ row, col }) }),

    flipTile: (sessionId: string, row: number, col: number): Promise<GridResponse> =>
        request<GridResponse>(`/game/${sessionId}/flip`, { method: 'POST', body: JSON.stringify({ row, col }) }),

    submitPath: (sessionId: string): Promise<SubmitResponse> =>
        request<SubmitResponse>(`/game/${sessionId}/submit`, { method: 'POST' }),

    selectTile: (sessionId: string, row: number, col: number): Promise<{ moves: number }> =>
        request<{ moves: number }>(`/game/${sessionId}/select`, { method: 'POST', body: JSON.stringify({ row, col }) }),

    saveResults: (scores: LevelResult[]): Promise<{ id: number; message: string }> =>
        request<{ id: number; message: string }>('/results', { method: 'POST', body: JSON.stringify({ scores }) }),
};

// ╔══════════════════════════════════════════════════════╗
// ║                    CONSTANTS                         ║
// ╚══════════════════════════════════════════════════════╝

const GAME_DURATION = 240;
const ANIMATION_STEP_MS = 400;
const ANIMATION_END_BUFFER_MS = 800;

const TUTORIAL_STEPS: readonly string[] = [
    "Connect the path from 🚀 Rocket to 🌍 Earth by rotating the pipe tiles.",
    "Click a tile to select it. Each tile is a 3×3 block with 3 arrows.",
    "Use ↻ Rotate to turn the tile's connections 90° clockwise.",
    "Use ⇄ Swap to reverse the arrow direction (flow), keeping the shape.",
    "Corner tiles have 45° diagonal arrows — use them to turn the path.",
    "Submit ✓ when the path is complete!",
] as const;

const LEVELS: readonly { rows: number; cols: number; label: string }[] = [
    { rows: 3, cols: 3, label: 'Section 1' },
    { rows: 5, cols: 5, label: 'Section 2' },
    { rows: 7, cols: 7, label: 'Section 3' },
] as const;

// ╔══════════════════════════════════════════════════════╗
// ║                  TILE COMPONENT                      ║
// ╚══════════════════════════════════════════════════════╝

const OPENING_CELL_MAP: Record<Direction, string> = {
    UP: '0-1',
    DOWN: '2-1',
    LEFT: '1-0',
    RIGHT: '1-2',
};

const TOWARD_CENTER: Record<Direction, number> = { UP: 90, DOWN: 270, LEFT: 0, RIGHT: 180 };
const AWAY_CENTER: Record<Direction, number> = { UP: 270, DOWN: 90, LEFT: 180, RIGHT: 0 };

const midAngle = (a: number, b: number): number => {
    let diff = b - a;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return (a + diff / 2 + 360) % 360;
};

const ArrowSVG = memo(({ angle }: { angle: number }) => (
    <div className="pp-arrowWrap" style={{ transform: `rotate(${angle}deg)` }}>
        <svg viewBox="0 0 24 24" width="65%" height="65%">
            <line x1="5" y1="12" x2="17" y2="12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
            <polyline points="13,7 18,12 13,17" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    </div>
));
ArrowSVG.displayName = 'ArrowSVG';

interface TileProps {
    tile: TileState;
    isSelected: boolean;
    onClick: () => void;
}

const Tile = memo<TileProps>(({ tile, isSelected, onClick }) => {
    if (tile.type === 'EMPTY') {
        return <div className="pp-tile pp-tile-empty" onClick={onClick} />;
    }

    const cells = useMemo(() => {
        const [o0, o1] = tile.openings;
        let angle0: number, angleCenter: number, angle1: number;

        if (tile.type === 'STRAIGHT') {
            const flowAngle = AWAY_CENTER[o1];
            angle0 = flowAngle;
            angleCenter = flowAngle;
            angle1 = flowAngle;
        } else {
            angle0 = TOWARD_CENTER[o0];
            angle1 = AWAY_CENTER[o1];
            angleCenter = midAngle(angle0, angle1);
        }

        const filled = new Map<string, number>();
        filled.set(OPENING_CELL_MAP[o0], angle0);
        filled.set('1-1', angleCenter);
        filled.set(OPENING_CELL_MAP[o1], angle1);

        const result: React.ReactNode[] = [];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const key = `${r}-${c}`;
                const arrowAngle = filled.get(key);
                result.push(
                    <div key={key} className={`pp-subCell ${arrowAngle !== undefined ? 'pp-filled' : 'pp-subEmpty'}`}>
                        {arrowAngle !== undefined && <ArrowSVG angle={arrowAngle} />}
                    </div>
                );
            }
        }
        return result;
    }, [tile.openings, tile.type]);

    return (
        <div className={`pp-tile ${isSelected ? 'pp-tile-selected' : ''}`} onClick={onClick}>
            <div className="pp-subGrid">{cells}</div>
        </div>
    );
});
Tile.displayName = 'Tile';

// ╔══════════════════════════════════════════════════════╗
// ║                  GRID COMPONENT                      ║
// ╚══════════════════════════════════════════════════════╝

const iconStyle = (point: EntryExit, rows: number, cols: number): React.CSSProperties => {
    switch (point.direction) {
        case 'LEFT': return { left: '-2.8rem', top: `${((point.row + 0.5) / rows) * 100}%`, transform: 'translateY(-50%)' };
        case 'RIGHT': return { right: '-2.8rem', top: `${((point.row + 0.5) / rows) * 100}%`, transform: 'translateY(-50%)' };
        case 'UP': return { top: '-2.8rem', left: `${((point.col + 0.5) / cols) * 100}%`, transform: 'translateX(-50%)' };
        case 'DOWN': return { bottom: '-2.8rem', left: `${((point.col + 0.5) / cols) * 100}%`, transform: 'translateX(-50%)' };
    }
};

const cellCenter = (row: number, col: number, rows: number, cols: number): { x: number; y: number } => ({
    x: ((col + 0.5) / cols) * 100,
    y: ((row + 0.5) / rows) * 100,
});

interface GameGridProps {
    grid: GridState;
    selectedTile: Position | null;
    onTileClick: (pos: Position) => void;
    start: EntryExit;
    end: EntryExit;
    animating?: boolean;
    animationPath?: PathCell[];
}

const GameGrid: React.FC<GameGridProps> = ({ grid, selectedTile, onTileClick, start, end, animating, animationPath }) => {
    const cols = grid[0]?.length || 0;
    const rows = grid.length;
    const [rocketPos, setRocketPos] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
        if (!animating || !animationPath || animationPath.length === 0) {
            setRocketPos(null);
            return;
        }

        const startCenter = cellCenter(start.row, start.col, rows, cols);
        const startOffset = {
            x: start.direction === 'LEFT' ? -8 : start.direction === 'RIGHT' ? 108 : startCenter.x,
            y: start.direction === 'UP' ? -8 : start.direction === 'DOWN' ? 108 : startCenter.y,
        };
        setRocketPos(startOffset);

        const endCenter = cellCenter(end.row, end.col, rows, cols);
        const endOffset = {
            x: end.direction === 'LEFT' ? -8 : end.direction === 'RIGHT' ? 108 : endCenter.x,
            y: end.direction === 'UP' ? -8 : end.direction === 'DOWN' ? 108 : endCenter.y,
        };

        const waypoints = [startOffset, ...animationPath.map(p => cellCenter(p.row, p.col, rows, cols)), endOffset];
        const timers: ReturnType<typeof setTimeout>[] = [];
        for (let i = 1; i < waypoints.length; i++) {
            timers.push(setTimeout(() => setRocketPos(waypoints[i]), i * ANIMATION_STEP_MS));
        }
        return () => timers.forEach(clearTimeout);
    }, [animating, animationPath, rows, cols, start, end]);

    return (
        <div className="pp-gridWrapper">
            <div className="pp-gridPositioner">
                <div className="pp-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                    {grid.map((row, r) => row.map((tile, c) => (
                        <Tile key={tile.id} tile={tile} isSelected={selectedTile?.row === r && selectedTile?.col === c}
                            onClick={() => onTileClick({ row: r, col: c })} />
                    )))}
                </div>
                <div className="pp-icon pp-bwIcon" style={iconStyle(start, rows, cols)}>🚀</div>
                <div className="pp-icon pp-bwIcon" style={iconStyle(end, rows, cols)}>🌍</div>
                {animating && rocketPos && (
                    <div className="pp-rocketAnimate pp-bwIcon" style={{ left: `${rocketPos.x}%`, top: `${rocketPos.y}%` }}>🚀</div>
                )}
            </div>
        </div>
    );
};

// ╔══════════════════════════════════════════════════════╗
// ║                CONTROLS COMPONENT                    ║
// ╚══════════════════════════════════════════════════════╝

interface ControlsProps {
    onRotate: () => void;
    onFlip: () => void;
    onSubmit: () => void;
    timeRemaining: number;
    selectionCount: number;
    disabled: boolean;
    currentLevel: number;
    totalLevels: number;
}

const Controls = memo<ControlsProps>(({ onRotate, onFlip, onSubmit, timeRemaining, selectionCount, disabled, currentLevel, totalLevels }) => {
    const formattedTime = useMemo(() => {
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = (timeRemaining % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    }, [timeRemaining]);

    return (
        <div>
            <div className="pp-controlsBar">
                <div className="pp-timer">{formattedTime}</div>
                <button className="pp-actionBtn" onClick={onRotate} disabled={disabled || selectionCount === 0} title="Rotate 90° clockwise">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                </button>
                <button className="pp-actionBtn" onClick={onFlip} disabled={disabled || selectionCount === 0} title="Flip direction">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                        <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                </button>
                <button className="pp-actionBtn" onClick={onSubmit} disabled={disabled} title="Submit path">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                </button>
            </div>
            <div className="pp-sectionLabel">Section {currentLevel} of {totalLevels}</div>
        </div>
    );
});
Controls.displayName = 'Controls';

// ╔══════════════════════════════════════════════════════╗
// ║            PATHFINDER GAME COMPONENT                  ║
// ╚══════════════════════════════════════════════════════╝

const toGrid = (apiGrid: ApiTile[][]): GridState =>
    apiGrid.map(row => row.map(t => ({ id: t.id, row: t.row, col: t.col, type: t.type, openings: [...t.openings] })));

const EMPTY_ENTRY: EntryExit = { row: 0, col: 0, direction: 'LEFT' };

interface PathfinderGameProps {
    rows: number;
    cols: number;
    currentLevel: number;
    totalLevels: number;
    onComplete: (success: boolean, stats: LevelStats) => void;
}

const PathfinderGame: React.FC<PathfinderGameProps> = ({ rows, cols, currentLevel, totalLevels, onComplete }) => {
    const [sessionId, setSessionId] = useState('');
    const [gameState, setGameState] = useState<GameState>({
        grid: [], start: EMPTY_ENTRY, end: EMPTY_ENTRY, status: 'PLAYING', selectedTile: null,
        timeRemaining: GAME_DURATION, attempts: 0, moves: 0, rotations: 0, flips: 0,
    });
    const [tutorialStep, setTutorialStep] = useState(0);
    const [showTutorial, setShowTutorial] = useState(true);
    const [animationPath, setAnimationPath] = useState<PathCell[]>([]);

    // Initialize game session
    useEffect(() => {
        let cancelled = false;
        api.startGame(rows, cols)
            .then(res => {
                if (cancelled) return;
                setSessionId(res.session_id);
                setGameState({
                    grid: toGrid(res.grid),
                    start: res.start,
                    end: res.end,
                    status: 'PLAYING',
                    selectedTile: null,
                    timeRemaining: GAME_DURATION,
                    attempts: 0,
                    moves: 0,
                    rotations: 0,
                    flips: 0,
                });
            })
            .catch(err => console.error('Failed to start game:', err));
        return () => { cancelled = true; };
    }, [rows, cols]);

    // Countdown timer
    useEffect(() => {
        if (gameState.status !== 'PLAYING') return;
        const timer = setInterval(() => {
            setGameState(prev => {
                if (prev.timeRemaining <= 1) {
                    clearInterval(timer);
                    return { ...prev, timeRemaining: 0, status: 'LOST' };
                }
                return { ...prev, timeRemaining: prev.timeRemaining - 1 };
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [gameState.status]);

    const handleTileClick = useCallback((pos: Position): void => {
        if (gameState.status !== 'PLAYING' || !sessionId) return;
        setGameState(prev => ({ ...prev, selectedTile: pos, moves: prev.moves + 1 }));
        api.selectTile(sessionId, pos.row, pos.col)
            .catch(err => console.warn('Select tile failed:', err));
    }, [gameState.status, sessionId]);

    const handleRotate = useCallback((): void => {
        if (gameState.status !== 'PLAYING' || !gameState.selectedTile || !sessionId) return;
        const { row, col } = gameState.selectedTile;
        api.rotateTile(sessionId, row, col)
            .then(res => {
                setGameState(prev => ({ ...prev, grid: toGrid(res.grid), rotations: res.rotations ?? prev.rotations + 1 }));
            })
            .catch(err => console.error('Rotate failed:', err));
    }, [gameState.status, gameState.selectedTile, sessionId]);

    const handleFlip = useCallback((): void => {
        if (gameState.status !== 'PLAYING' || !gameState.selectedTile || !sessionId) return;
        const { row, col } = gameState.selectedTile;
        api.flipTile(sessionId, row, col)
            .then(res => {
                setGameState(prev => ({ ...prev, grid: toGrid(res.grid), flips: res.flips ?? prev.flips + 1 }));
            })
            .catch(err => console.error('Flip failed:', err));
    }, [gameState.status, gameState.selectedTile, sessionId]);

    const handleSubmit = useCallback((): void => {
        if (gameState.status !== 'PLAYING' || !sessionId) return;
        api.submitPath(sessionId)
            .then(res => {
                if (res.valid && res.path) {
                    setAnimationPath(res.path);
                    setGameState(prev => ({ ...prev, status: 'ANIMATING', attempts: prev.attempts + 1 }));
                    setTimeout(() => {
                        setAnimationPath([]);
                        setGameState(prev => ({ ...prev, status: 'WON' }));
                    }, res.path.length * ANIMATION_STEP_MS + ANIMATION_END_BUFFER_MS);
                } else {
                    setGameState(prev => ({ ...prev, attempts: prev.attempts + 1 }));
                }
            })
            .catch(err => console.error('Submit failed:', err));
    }, [gameState.status, sessionId]);

    const stats = useMemo<LevelStats>(() => ({
        moves: gameState.moves,
        rotations: gameState.rotations,
        flips: gameState.flips,
        time: GAME_DURATION - gameState.timeRemaining,
    }), [gameState.moves, gameState.rotations, gameState.flips, gameState.timeRemaining]);

    return (
        <div className="pp-gameContainer">
            {showTutorial && (
                <div>
                    <div className="pp-tutorialBar">
                        <button onClick={() => setTutorialStep(Math.max(0, tutorialStep - 1))}>‹</button>
                        <span>{TUTORIAL_STEPS[tutorialStep]}</span>
                        <button onClick={() => {
                            if (tutorialStep < TUTORIAL_STEPS.length - 1) setTutorialStep(tutorialStep + 1);
                            else setShowTutorial(false);
                        }}>›</button>
                    </div>
                    <div className="pp-tutorialDots">
                        {TUTORIAL_STEPS.map((_, i) => (
                            <div key={i} className={`pp-tutorialDot ${i === tutorialStep ? 'pp-tutorialDotActive' : ''}`} />
                        ))}
                    </div>
                </div>
            )}
            <div className="pp-gameLayout">
                <div className="pp-boardSection">
                    <GameGrid
                        grid={gameState.grid}
                        selectedTile={gameState.selectedTile}
                        onTileClick={handleTileClick}
                        start={gameState.start}
                        end={gameState.end}
                        animating={gameState.status === 'ANIMATING'}
                        animationPath={animationPath}
                    />
                </div>
                <Controls
                    onRotate={handleRotate}
                    onFlip={handleFlip}
                    onSubmit={handleSubmit}
                    timeRemaining={gameState.timeRemaining}
                    selectionCount={gameState.selectedTile ? 1 : 0}
                    disabled={gameState.status !== 'PLAYING'}
                    currentLevel={currentLevel}
                    totalLevels={totalLevels}
                />
            </div>
            {gameState.status === 'WON' && (
                <div className="pp-overlay"><div className="pp-modal">
                    <div className="pp-successIcon">🎉</div><h2>Path Found!</h2>
                    <p className="pp-statsLine">Time: {stats.time}s · Moves: {stats.moves}</p>
                    <button className="pp-nextBtn" onClick={() => onComplete(true, stats)}>Next Question →</button>
                </div></div>
            )}
            {gameState.status === 'LOST' && (
                <div className="pp-overlay"><div className="pp-modal">
                    <div className="pp-successIcon">⏱️</div><h2>Time's Up</h2>
                    <button className="pp-nextBtn" onClick={() => onComplete(false, stats)}>Next Question →</button>
                </div></div>
            )}
        </div>
    );
};

// ╔══════════════════════════════════════════════════════╗
// ║              PROCTORING COMPONENT                    ║
// ╚══════════════════════════════════════════════════════╝

const Proctoring: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const video = videoRef.current;
        const startWebcam = async (): Promise<void> => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                if (video) video.srcObject = stream;
            } catch {
                setError('Camera/Audio access denied. Please allow permissions.');
            }
        };
        startWebcam();
        return () => {
            if (video?.srcObject) {
                (video.srcObject as MediaStream).getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    if (error) {
        return <div style={{ color: 'red', border: '1px solid red', padding: '1rem' }}>{error}</div>;
    }

    return (
        <div style={{ position: 'fixed', bottom: 20, right: 20, width: 180, height: 135, borderRadius: 12, overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', border: '2px solid #38bdf8', zIndex: 1000, background: '#000' }}>
            <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', top: 5, right: 5, width: 10, height: 10, borderRadius: '50%', backgroundColor: 'red', boxShadow: '0 0 5px red', animation: 'pulse 1s infinite' }} />
        </div>
    );
};

// ╔══════════════════════════════════════════════════════╗
// ║            ASSESSMENT FLOW (MAIN EXPORT)             ║
// ╚══════════════════════════════════════════════════════╝

type Step = 'INSTRUCTIONS' | 'SYSTEM_CHECK' | 'GAME' | 'RESULTS';

export const PipePuzzle: React.FC = () => {
    const [step, setStep] = useState<Step>('INSTRUCTIONS');
    const [currentLevel, setCurrentLevel] = useState(0);
    const [results, setResults] = useState<LevelResult[]>([]);

    const handleLevelComplete = useCallback((success: boolean, stats: LevelStats): void => {
        setResults(prev => {
            const newResults = [...prev, { level: currentLevel + 1, success, ...stats }];
            if (currentLevel >= LEVELS.length - 1) {
                api.saveResults(newResults).catch(() => {
                    const existing: { timestamp: string; scores: LevelResult[] }[] =
                        JSON.parse(localStorage.getItem('assessment_results') || '[]');
                    localStorage.setItem('assessment_results', JSON.stringify([
                        ...existing,
                        { timestamp: new Date().toISOString(), scores: newResults },
                    ]));
                });
            }
            return newResults;
        });

        if (currentLevel < LEVELS.length - 1) {
            setCurrentLevel(prev => prev + 1);
        } else {
            setStep('RESULTS');
        }
    }, [currentLevel]);

    if (step === 'INSTRUCTIONS') {
        return (
            <div className="container" style={{ textAlign: 'center', maxWidth: 520 }}>
                <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Assessment Instructions</h1>
                <div style={{ background: '#fff', borderRadius: 12, padding: '2rem', textAlign: 'left', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', lineHeight: 1.7, color: '#555' }}>
                    <p>Connect the pipes from START to END by rotating the tiles. Each tile is a 3×3 block showing its connections.</p><br />
                    <p>Corner tiles have 45° arrows — use them to turn the path direction.</p><br />
                    <ul style={{ paddingLeft: '1.5rem' }}>
                        <li>Click a tile to select it</li>
                        <li>Use Rotate ↻ and Flip ⇄ buttons</li>
                        <li>Submit when the path is complete</li>
                    </ul>
                </div>
                <button onClick={() => setStep('SYSTEM_CHECK')} style={{ marginTop: '1.5rem', padding: '.75rem 2rem', background: '#4a4a4a', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: '1rem' }}>
                    Start System Check
                </button>
            </div>
        );
    }

    if (step === 'SYSTEM_CHECK') {
        return (
            <div className="container" style={{ textAlign: 'center', maxWidth: 520 }}>
                <h2 style={{ marginBottom: '1rem' }}>System Check</h2>
                <div style={{ background: '#fff', borderRadius: 12, padding: '2rem', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '1.5rem' }}>
                    <p style={{ color: '#555', marginBottom: '1rem' }}>Ensure your face is visible and audio is working.</p>
                    <Proctoring />
                </div>
                <button onClick={() => setStep('GAME')} style={{ padding: '.75rem 2rem', background: '#4a4a4a', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: '1rem' }}>
                    I'm Ready — Start
                </button>
            </div>
        );
    }

    if (step === 'RESULTS') {
        return (
            <div className="container" style={{ textAlign: 'center', maxWidth: 520 }}>
                <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Assessment Complete</h1>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                    {results.map((r, i) => (
                        <div key={i} style={{ padding: '1rem', background: '#fff', borderRadius: 8, border: `2px solid ${r.success ? '#4caf50' : '#f44336'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong>Section {r.level}</strong>
                            <span style={{ color: r.success ? '#4caf50' : '#f44336', fontWeight: 600 }}>{r.success ? 'Passed' : 'Failed'}</span>
                            <span style={{ color: '#999', fontSize: '.85rem' }}>{r.moves} moves · {r.time}s</span>
                        </div>
                    ))}
                </div>
                <button onClick={() => window.location.reload()} style={{ marginTop: '1.5rem', padding: '.75rem 2rem', background: 'transparent', border: '1px solid #ccc', borderRadius: 8, color: '#666' }}>
                    Return to Home
                </button>
            </div>
        );
    }

    const levelConfig = LEVELS[currentLevel];
    return (
        <>
            <Proctoring />
            <PathfinderGame
                key={currentLevel}
                rows={levelConfig.rows}
                cols={levelConfig.cols}
                currentLevel={currentLevel + 1}
                totalLevels={LEVELS.length}
                onComplete={handleLevelComplete}
            />
        </>
    );
};

export default PipePuzzle;

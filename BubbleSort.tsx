/**
 * BubbleSort.tsx — Bubble Sort assessment game.
 * Players evaluate math expressions inside dark bubbles and select them
 * from lowest to highest value. Matches Accenture-style assessment UI.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';

// ╔══════════════════════════════════════════════════════╗
// ║                      TYPES                           ║
// ╚══════════════════════════════════════════════════════╝

type Operator = '+' | '-' | '×' | '÷';

interface BubbleData {
    id: number;
    expression: string;
    value: number;
    selected: boolean;
    // Random position offsets for scattered layout
    offsetX: number;
    offsetY: number;
    size: number;
}

interface RoundResult {
    round: number;
    correct: number;
    wrong: number;
    score: number;
    timeUsed: number;
    completed: boolean;
}

interface DifficultyConfig {
    bubbleCount: number;
    operators: Operator[];
    maxNumber: number;
    roundTime: number;
}

type GameScreen = 'INSTRUCTIONS' | 'PLAYING' | 'COMPLETE';

// ╔══════════════════════════════════════════════════════╗
// ║                    CONSTANTS                         ║
// ╚══════════════════════════════════════════════════════╝

const SESSION_DURATION = 420; // 7 minutes
const ROUND_TIME = 15;
const TOTAL_QUESTIONS = 20;
const CORRECT_DELAY_MS = 250;

const DIFFICULTY_TABLE: DifficultyConfig[] = [
    { bubbleCount: 3, operators: ['+'], maxNumber: 20, roundTime: ROUND_TIME },
    { bubbleCount: 3, operators: ['+'], maxNumber: 30, roundTime: ROUND_TIME },
    { bubbleCount: 3, operators: ['+', '-'], maxNumber: 20, roundTime: ROUND_TIME },
    { bubbleCount: 3, operators: ['+', '-'], maxNumber: 30, roundTime: ROUND_TIME },
    { bubbleCount: 3, operators: ['+', '-', '×'], maxNumber: 15, roundTime: ROUND_TIME },
    { bubbleCount: 3, operators: ['+', '-', '×'], maxNumber: 20, roundTime: ROUND_TIME },
    { bubbleCount: 3, operators: ['+', '-', '×', '÷'], maxNumber: 20, roundTime: ROUND_TIME },
    { bubbleCount: 3, operators: ['+', '-', '×', '÷'], maxNumber: 30, roundTime: ROUND_TIME },
];

// Predefined equilateral-triangle positions centered in the arena (percentage offsets)
const SCATTER_POSITIONS = [
    // Variation 1: point-up centered
    [
        { x: 50, y: 20, s: 130 },
        { x: 28, y: 58, s: 130 },
        { x: 72, y: 58, s: 130 },
    ],
    // Variation 2: point-down centered
    [
        { x: 28, y: 30, s: 130 },
        { x: 72, y: 30, s: 130 },
        { x: 50, y: 68, s: 130 },
    ],
    // Variation 3: point-up centered (same as 1, re-shuffled)
    [
        { x: 72, y: 58, s: 130 },
        { x: 50, y: 20, s: 130 },
        { x: 28, y: 58, s: 130 },
    ],
    // Variation 4: point-down centered (same as 2, re-shuffled)
    [
        { x: 50, y: 68, s: 130 },
        { x: 28, y: 30, s: 130 },
        { x: 72, y: 30, s: 130 },
    ],
];

// ╔══════════════════════════════════════════════════════╗
// ║                  EXPRESSION GENERATOR                ║
// ╚══════════════════════════════════════════════════════╝

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateExpression(operators: Operator[], maxNum: number): { expression: string; value: number } {
    const op = operators[Math.floor(Math.random() * operators.length)];
    let a: number, b: number, value: number;

    switch (op) {
        case '+':
            a = randomInt(1, maxNum);
            b = randomInt(1, maxNum);
            value = a + b;
            return { expression: `${a}+${b}`, value };
        case '-':
            a = randomInt(2, maxNum);
            b = randomInt(0, a);
            value = a - b;
            return { expression: `${a}-${b}`, value };
        case '×':
            a = randomInt(1, Math.min(maxNum, 12));
            b = randomInt(1, Math.min(maxNum, 9));
            value = a * b;
            return { expression: `${a}×${b}`, value };
        case '÷':
            b = randomInt(2, Math.min(maxNum, 10));
            value = randomInt(1, Math.min(maxNum, 12));
            a = b * value; // ensure clean division
            return { expression: `${a}÷${b}`, value };
        default:
            a = randomInt(1, maxNum);
            b = randomInt(1, maxNum);
            value = a + b;
            return { expression: `${a}+${b}`, value };
    }
}

function generateBubbles(config: DifficultyConfig, round: number): BubbleData[] {
    const bubbles: BubbleData[] = [];
    const usedValues = new Set<number>();
    const layout = SCATTER_POSITIONS[(round - 1) % SCATTER_POSITIONS.length];

    for (let i = 0; i < config.bubbleCount; i++) {
        let attempts = 0;
        let expr: { expression: string; value: number };
        do {
            expr = generateExpression(config.operators, config.maxNumber);
            attempts++;
        } while (usedValues.has(expr.value) && attempts < 50);
        usedValues.add(expr.value);
        bubbles.push({
            id: i,
            expression: expr.expression,
            value: expr.value,
            selected: false,
            offsetX: layout[i].x,
            offsetY: layout[i].y,
            size: layout[i].s,
        });
    }
    return bubbles;
}

// ╔══════════════════════════════════════════════════════╗
// ║                  SOUND EFFECTS                       ║
// ╚══════════════════════════════════════════════════════╝

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine'): void {
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
    } catch {
        // Audio not supported
    }
}

const playCorrect = () => playTone(880, 0.1, 'sine');

// ╔══════════════════════════════════════════════════════╗
// ║                  BUBBLE COMPONENT                    ║
// ╚══════════════════════════════════════════════════════╝

interface BubbleProps {
    bubble: BubbleData;
    onClick: () => void;
    disabled: boolean;
}

const Bubble = memo<BubbleProps>(({ bubble, onClick, disabled }) => (
    <div
        className={`bs-bubble ${bubble.selected ? 'bs-bubble-ghost' : ''} ${disabled && !bubble.selected ? 'bs-bubble-disabled' : ''}`}
        onClick={disabled || bubble.selected ? undefined : onClick}
        style={{
            width: bubble.size,
            height: bubble.size,
            left: `${bubble.offsetX}%`,
            top: `${bubble.offsetY}%`,
            transform: `translate(-50%, -50%)`,
        }}
    >
        <span className="bs-bubble-text">{bubble.expression}</span>
    </div>
));
Bubble.displayName = 'Bubble';

// ╔══════════════════════════════════════════════════════╗
// ║              CIRCULAR TIMER COMPONENT                ║
// ╚══════════════════════════════════════════════════════╝

interface CircleTimerProps {
    seconds: number;
    total: number;
}

const CircleTimer = memo<CircleTimerProps>(({ seconds, total }) => {
    const radius = 22;
    const circumference = 2 * Math.PI * radius;
    const progress = total > 0 ? seconds / total : 0;
    const strokeOffset = circumference * (1 - progress);

    return (
        <div className="bs-circle-timer">
            <svg width="56" height="56" viewBox="0 0 56 56">
                <circle
                    cx="28" cy="28" r={radius}
                    fill="none" stroke="#e0e0e0" strokeWidth="3"
                />
                <circle
                    cx="28" cy="28" r={radius}
                    fill="none" stroke="#333" strokeWidth="3"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeOffset}
                    strokeLinecap="round"
                    style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1s linear' }}
                />
            </svg>
            <span className="bs-circle-timer-text">{seconds}</span>
        </div>
    );
});
CircleTimer.displayName = 'CircleTimer';

// ╔══════════════════════════════════════════════════════╗
// ║               INSTRUCTIONS SCREEN                    ║
// ╚══════════════════════════════════════════════════════╝

interface InstructionsProps {
    onStart: () => void;
}

const Instructions: React.FC<InstructionsProps> = ({ onStart }) => (
    <div className="bs-card bs-instructions">
        <h1 className="bs-title">Section 2: Numerical Reasoning</h1>
        <div className="bs-instructions-body">
            <h3>Instructions</h3>
            <ul>
                <li>You will be presented with 3 bubbles, each containing a mathematical expression.</li>
                <li>Select the bubbles in order from <strong>lowest</strong> to <strong>highest</strong> value.</li>
                <li>Each round has a time limit of <strong>15 seconds</strong>. The overall session duration is <strong>7 minutes</strong>.</li>
                <li>Scoring: <strong>+1</strong> for each correct selection, <strong>−1</strong> for each incorrect selection.</li>
                <li>Once all bubbles are selected correctly, the next round begins automatically.</li>
                <li>You may press <strong>Submit</strong> at any time to end the assessment.</li>
            </ul>
        </div>
        <button className="bs-start-btn" onClick={onStart}>Begin Assessment</button>
    </div>
);

// ╔══════════════════════════════════════════════════════╗
// ║              MAIN GAME COMPONENT                     ║
// ╚══════════════════════════════════════════════════════╝

interface BubbleSortProps {
    onBack?: () => void;
}

export const BubbleSort: React.FC<BubbleSortProps> = ({ onBack }) => {
    const [screen, setScreen] = useState<GameScreen>('INSTRUCTIONS');
    const [round, setRound] = useState(1);
    const [sessionTime, setSessionTime] = useState(SESSION_DURATION);
    const [roundTime, setRoundTime] = useState(ROUND_TIME);
    const [bubbles, setBubbles] = useState<BubbleData[]>([]);
    const [selectionOrder, setSelectionOrder] = useState(0);
    const [_roundResults, setRoundResults] = useState<RoundResult[]>([]);
    const [correctCount, setCorrectCount] = useState(0);
    const [wrongCount, setWrongCount] = useState(0);
    const [_totalScore, setTotalScore] = useState(0);
    const [processing, setProcessing] = useState(false);
    const roundStartRef = useRef(Date.now());
    const roundEndedRef = useRef(false);

    const config = useMemo<DifficultyConfig>(() => {
        const idx = Math.min(round - 1, DIFFICULTY_TABLE.length - 1);
        return DIFFICULTY_TABLE[idx];
    }, [round]);

    // ─── Start a new round ───
    const startRound = useCallback((roundNum: number) => {
        const cfg = DIFFICULTY_TABLE[Math.min(roundNum - 1, DIFFICULTY_TABLE.length - 1)];
        setBubbles(generateBubbles(cfg, roundNum));
        setRoundTime(cfg.roundTime);
        setSelectionOrder(0);
        setCorrectCount(0);
        setWrongCount(0);
        setProcessing(false);
        roundEndedRef.current = false;
        roundStartRef.current = Date.now();
    }, []);

    // ─── End current round ───
    const endRound = useCallback((completed: boolean) => {
        if (roundEndedRef.current) return;
        roundEndedRef.current = true;

        const timeUsed = Math.round((Date.now() - roundStartRef.current) / 1000);
        const roundScore = correctCount - wrongCount;
        setTotalScore(prev => prev + roundScore);
        setRoundResults(prev => [...prev, {
            round, correct: correctCount, wrong: wrongCount,
            score: roundScore, timeUsed, completed,
        }]);

        if (sessionTime <= 0 || round >= TOTAL_QUESTIONS) {
            setScreen('COMPLETE');
            return;
        }

        setRound(prev => prev + 1);
        startRound(round + 1);
    }, [round, correctCount, wrongCount, sessionTime, startRound]);

    const endRoundRef = useRef(endRound);
    useEffect(() => { endRoundRef.current = endRound; }, [endRound]);

    // ─── Session timer ───
    useEffect(() => {
        if (screen !== 'PLAYING') return;
        const timer = setInterval(() => {
            setSessionTime(prev => {
                if (prev <= 1) { setScreen('COMPLETE'); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [screen]);

    // ─── Round timer ───
    useEffect(() => {
        if (screen !== 'PLAYING') return;
        const timer = setInterval(() => {
            setRoundTime(prev => {
                if (prev <= 1) { endRoundRef.current(false); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [screen, round]);

    // ─── Handle bubble click ───
    const handleBubbleClick = useCallback((bubbleId: number) => {
        if (processing || screen !== 'PLAYING') return;

        setBubbles(prev => {
            const bubble = prev.find(b => b.id === bubbleId);
            if (!bubble || bubble.selected) return prev;

            const unselected = prev.filter(b => !b.selected).sort((a, b) => a.value - b.value);
            if (unselected.length === 0) return prev;

            const isCorrect = bubble.id === unselected[0].id;

            if (isCorrect) {
                playCorrect();
                setCorrectCount(c => c + 1);
                setSelectionOrder(o => o + 1);

                const updated = prev.map(b =>
                    b.id === bubbleId ? { ...b, selected: true } : b
                );

                if (updated.filter(b => !b.selected).length === 0) {
                    setProcessing(true);
                    setTimeout(() => endRound(true), CORRECT_DELAY_MS);
                }
                return updated;
            } else {
                setWrongCount(c => c + 1);
                return prev; // silent — no visual feedback
            }
        });
    }, [processing, screen, selectionOrder, endRound]);

    // ─── Start game ───
    const handleStart = useCallback(() => {
        setScreen('PLAYING');
        setRound(1);
        setSessionTime(SESSION_DURATION);
        setRoundResults([]);
        setTotalScore(0);
        startRound(1);
    }, [startRound]);

    // ─── Submit (end early) ───
    const handleSubmit = useCallback(() => {
        const timeUsed = Math.round((Date.now() - roundStartRef.current) / 1000);
        const roundScore = correctCount - wrongCount;
        setTotalScore(prev => prev + roundScore);
        setRoundResults(prev => [...prev, {
            round, correct: correctCount, wrong: wrongCount,
            score: roundScore, timeUsed, completed: bubbles.every(b => b.selected),
        }]);
        setScreen('COMPLETE');
    }, [round, correctCount, wrongCount, bubbles]);

    // ─── Next (go back to launcher) ───
    const handleNext = useCallback(() => {
        if (onBack) onBack();
    }, [onBack]);

    // ─── Render ───
    if (screen === 'INSTRUCTIONS') {
        return (
            <div className="bs-container">
                <Instructions onStart={handleStart} />
            </div>
        );
    }

    if (screen === 'COMPLETE') {
        return (
            <div className="bs-container">
                <div className="bs-card bs-complete-card">
                    <h1 className="bs-title">Session Complete</h1>
                    <p className="bs-complete-text">Your responses have been recorded.</p>
                    <button className="bs-start-btn" onClick={handleNext}>Next →</button>
                </div>
            </div>
        );
    }

    return (
        <div className="bs-container">
            <div className="bs-game-panel">
                {/* Header bar */}
                <div className="bs-header-bar">
                    <span className="bs-question-label">
                        Question {round} of {TOTAL_QUESTIONS}
                    </span>
                    <button className="bs-submit-inline" onClick={handleSubmit}>Submit</button>
                </div>

                {/* Bubble arena */}
                <div className="bs-arena">
                    {bubbles.map(b => (
                        <Bubble
                            key={`${round}-${b.id}`}
                            bubble={b}
                            onClick={() => handleBubbleClick(b.id)}
                            disabled={processing || b.selected}
                        />
                    ))}
                </div>

                {/* Footer with timer and instructions */}
                <div className="bs-footer">
                    <CircleTimer seconds={roundTime} total={config.roundTime} />
                    <div className="bs-footer-text">
                        <span>Select the bubbles in order from the</span>
                        <span><strong>LOWEST</strong> to the <strong>HIGHEST</strong> value</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BubbleSort;

import { StrictMode, useState, useCallback, useRef, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { PipePuzzle } from './components/PipePuzzle'
import { BubbleSort } from './components/BubbleSort'

type AppScreen = 'WELCOME' | 'SYSTEM_CHECKS' | 'LAUNCHER' | 'PIPE_PUZZLE' | 'BUBBLE_SORT';
type CheckStatus = 'idle' | 'checking' | 'passed' | 'failed';

// ╔══════════════════════════════════════════════════════╗
// ║              PROCTORING WEBCAM OVERLAY                ║
// ╚══════════════════════════════════════════════════════╝

interface ProctoringOverlayProps {
  stream: MediaStream | null;
}

function ProctoringOverlay({ stream }: ProctoringOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [position, setPosition] = useState({ x: window.innerWidth - 300, y: window.innerHeight - 230 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Initial position bottom-right
    setPosition({ x: window.innerWidth - 300, y: window.innerHeight - 210 });

    const handleResize = () => {
      setPosition(prev => ({
        x: Math.max(0, Math.min(prev.x, window.innerWidth - 280)),
        y: Math.min(prev.y, window.innerHeight - 189)
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const handlePointerDown = (e: any) => {
    setIsDragging(true);
    dragStartOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: any) => {
    if (!isDragging) return;
    const newX = e.clientX - dragStartOffset.current.x;
    const newY = e.clientY - dragStartOffset.current.y;

    setPosition({
      x: Math.max(0, Math.min(newX, window.innerWidth - 280)),
      y: Math.max(0, Math.min(newY, window.innerHeight - 189))
    });
  };

  const handlePointerUp = (e: any) => {
    setIsDragging(false);
    e.target.releasePointerCapture(e.pointerId);
  };

  if (!stream) return null;

  return (
    <div
      className="proctor-overlay"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        bottom: 'auto',
        right: 'auto',
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none'
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="proctor-video"
        style={{ pointerEvents: 'none' }}
      />
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║              PROCTORING INSTRUCTIONS                  ║
// ╚══════════════════════════════════════════════════════╝


interface WelcomePageProps {
  onTakeTest: () => void;
}

function WelcomePage({ onTakeTest }: WelcomePageProps) {
  return (
    <div className="portal">
      <header className="portal-header">
        <div className="portal-header-inner">
          <span className="portal-logo">Assessment Portal</span>
          <span className="portal-header-right">Candidate Assessment</span>
        </div>
      </header>

      <main className="portal-main" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <div className="proctor-checks-card" style={{ maxWidth: 600, width: '100%', textAlign: 'center' }}>
          <h1 className="proctor-title" style={{ marginBottom: '1rem' }}>Secure Assessment Environment</h1>
          <p className="proctor-subtitle" style={{ marginBottom: '2rem' }}>
            Before proceeding, please ensure:
          </p>
          <ul style={{ textAlign: 'left', margin: '0 auto 2rem', display: 'inline-block', lineHeight: 1.8, color: '#444' }}>
            <li><strong style={{ color: '#d32f2f' }}>No background apps</strong> are running. This is extremely important.</li>
            <li>Your webcam and microphone will remain active and recorded.</li>
            <li>The assessment will run in <strong style={{ color: '#1976d2' }}>Full Screen Mode</strong>.</li>
            <li>Do not navigate away or disable the camera during the test.</li>
            <li>Ensure your face is clearly visible with adequate lighting.</li>
          </ul>

          <div className="proctor-consent" style={{ marginBottom: '2rem' }}>
            <p style={{ fontSize: '0.85rem', color: '#666' }}>
              By clicking "Take Test", you acknowledge that this is a secure, proctored environment and consent to comprehensive video and audio recording.
            </p>
          </div>

          <button
            className="proctor-take-test-btn"
            onClick={onTakeTest}
            style={{ padding: '1rem', fontSize: '1.2rem', background: '#1976d2' }}
          >
            Take Test
          </button>
        </div>
      </main>
    </div>
  );
}

interface SystemChecksPageProps {
  onProceed: () => void;
  systemCheck: CheckStatus;
  videoCheck: CheckStatus;
  audioCheck: CheckStatus;
  secureBrowserCheck: CheckStatus;
  onRunChecks: () => void;
  allPassed: boolean;
  isLoading: boolean;
}

function SystemChecksPage({ onProceed, systemCheck, videoCheck, audioCheck, secureBrowserCheck, onRunChecks, allPassed, isLoading }: SystemChecksPageProps) {
  return (
    <div className="portal">
      <header className="portal-header">
        <div className="portal-header-inner">
          <span className="portal-logo">Assessment Portal</span>
          <span className="portal-header-right">System Checks Phase</span>
        </div>
      </header>

      <main className="portal-main">
        <div className="proctor-layout">
          {/* LEFT — Instructions */}
          <div className="proctor-left">
            <h1 className="proctor-title">System Requirements Verification</h1>
            <p className="proctor-subtitle">
              We need to verify that your camera and microphone are working correctly before starting the assessment.
            </p>

            <div className="proctor-section">
              <h3>General Instructions</h3>
              <ul>
                <li>Ensure you have a working Web Camera.</li>
                <li>Ensure you have a working Microphone.</li>
                <li>Grant permission when the browser prompts for Camera and Audio access.</li>
                <li>Ensure your face is clearly visible and well-lit.</li>
                <li>Do not use headphones or earphones during the test.</li>
                <li>Close all other tabs, browsers, and background applications.</li>
                <li>Ensure you are alone in a quiet, distraction-free environment.</li>
                <li>Do not navigate away from the assessment window.</li>
                <li>Have a stable internet connection before starting the assessment.</li>
                <li>Refrain from looking away from the screen for extended periods.</li>
              </ul>
            </div>
          </div>

          {/* RIGHT — System Checks */}
          <div className="proctor-right">
            <div className="proctor-checks-card">
              <h3 className="proctor-checks-title">System Checks</h3>
              <p className="proctor-checks-desc">
                All checks must pass before you can begin the assessment.
              </p>

              <div className="proctor-roadmap">
                <div className="roadmap-step">
                  <div className="roadmap-node-col">
                    <div className={`roadmap-circle check-${videoCheck}`}>
                      {videoCheck === 'passed' ? '✓' : videoCheck === 'failed' ? '✗' : '1'}
                    </div>
                    <div className={`roadmap-line ${videoCheck === 'passed' ? 'roadmap-line-filled' : ''}`} />
                  </div>
                  <div className="roadmap-content">
                    <span className="roadmap-label">Video Permission</span>
                    <span className={`roadmap-status check-status-${videoCheck}`}>
                      {videoCheck === 'idle' ? 'Pending' : videoCheck === 'checking' ? 'Checking...' : videoCheck === 'passed' ? 'Passed' : 'Failed'}
                    </span>
                  </div>
                </div>

                <div className="roadmap-step">
                  <div className="roadmap-node-col">
                    <div className={`roadmap-circle check-${audioCheck}`}>
                      {audioCheck === 'passed' ? '✓' : audioCheck === 'failed' ? '✗' : '2'}
                    </div>
                    <div className={`roadmap-line ${audioCheck === 'passed' ? 'roadmap-line-filled' : ''}`} />
                  </div>
                  <div className="roadmap-content">
                    <span className="roadmap-label">Audio Permission</span>
                    <span className={`roadmap-status check-status-${audioCheck}`}>
                      {audioCheck === 'idle' ? 'Pending' : audioCheck === 'checking' ? 'Checking...' : audioCheck === 'passed' ? 'Passed' : 'Failed'}
                    </span>
                  </div>
                </div>

                <div className="roadmap-step">
                  <div className="roadmap-node-col">
                    <div className={`roadmap-circle check-${systemCheck}`}>
                      {systemCheck === 'passed' ? '✓' : systemCheck === 'failed' ? '✗' : '3'}
                    </div>
                    <div className={`roadmap-line ${systemCheck === 'passed' ? 'roadmap-line-filled' : ''}`} />
                  </div>
                  <div className="roadmap-content">
                    <span className="roadmap-label">System Compatibility</span>
                    <span className={`roadmap-status check-status-${systemCheck}`}>
                      {systemCheck === 'idle' ? 'Pending' : systemCheck === 'checking' ? 'Checking...' : systemCheck === 'passed' ? 'Passed' : 'Failed'}
                    </span>
                  </div>
                </div>

                <div className="roadmap-step roadmap-step-last">
                  <div className="roadmap-node-col">
                    <div className={`roadmap-circle check-${secureBrowserCheck}`}>
                      {secureBrowserCheck === 'passed' ? '✓' : secureBrowserCheck === 'failed' ? '✗' : '4'}
                    </div>
                  </div>
                  <div className="roadmap-content">
                    <span className="roadmap-label">Secure Browser (Fullscreen)</span>
                    <span className={`roadmap-status check-status-${secureBrowserCheck}`}>
                      {secureBrowserCheck === 'idle' ? 'Pending' : secureBrowserCheck === 'checking' ? 'Checking...' : secureBrowserCheck === 'passed' ? 'Passed' : 'Failed'}
                    </span>
                  </div>
                </div>
              </div>

              {!allPassed && (
                <button
                  className="proctor-run-checks-btn"
                  onClick={onRunChecks}
                  disabled={systemCheck === 'checking' || videoCheck === 'checking' || audioCheck === 'checking' || secureBrowserCheck === 'checking'}
                >
                  {systemCheck === 'idle' ? 'Run All 4 Tests' : 'Retry Tests'}
                </button>
              )}

              <button
                className="proctor-take-test-btn"
                onClick={onProceed}
                disabled={!allPassed || isLoading}
              >
                {isLoading ? 'Starting Assessment...' : 'Start Assessment'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║                    MAIN APP                           ║
// ╚══════════════════════════════════════════════════════╝

function App() {
  const [screen, setScreen] = useState<AppScreen>('WELCOME');
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Individual check states
  const [systemCheck, setSystemCheck] = useState<CheckStatus>('idle');
  const [videoCheck, setVideoCheck] = useState<CheckStatus>('idle');
  const [audioCheck, setAudioCheck] = useState<CheckStatus>('idle');
  const [secureBrowserCheck, setSecureBrowserCheck] = useState<CheckStatus>('idle');

  const allPassed = systemCheck === 'passed' && videoCheck === 'passed' && audioCheck === 'passed' && secureBrowserCheck === 'passed';

  const startRecording = useCallback((stream: MediaStream) => {
    let options = { mimeType: 'video/webm;codecs=vp9,opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm;codecs=vp8,opus' };
    }
    try {
      const mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          // chunks can be uploaded here in a real scenario
        }
      };

      mediaRecorder.start(1000); // Collect data chunks every second
    } catch (e) {
      console.error('Error starting recording:', e);
    }
  }, []);

  const handleTakeTestClick = () => {
    setScreen('SYSTEM_CHECKS');
  };

  const runChecks = useCallback(async () => {
    setIsLoading(true);
    setVideoCheck('checking');
    setAudioCheck('idle');
    setSystemCheck('idle');

    // 1. Video permission check
    let videoStream: MediaStream | null = null;
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setVideoCheck('passed');
    } catch {
      setVideoCheck('failed');
      setIsLoading(false);
      return;
    }

    // 2. Audio permission check
    setAudioCheck('checking');
    let audioStream: MediaStream | null = null;
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioCheck('passed');
    } catch {
      setAudioCheck('failed');
      if (videoStream) videoStream.getTracks().forEach(t => t.stop());
      setIsLoading(false);
      return;
    }

    // 3. System compatibility check
    setSystemCheck('checking');
    await new Promise(r => setTimeout(r, 800));
    const hasMediaDevices = !!navigator.mediaDevices?.getUserMedia;
    if (!hasMediaDevices) {
      setSystemCheck('failed');
      if (videoStream) videoStream.getTracks().forEach(t => t.stop());
      if (audioStream) audioStream.getTracks().forEach(t => t.stop());
      setIsLoading(false);
      return;
    }
    setSystemCheck('passed');

    // 4. Secure Browser check (Fullscreen)
    setSecureBrowserCheck('checking');

    // Give a tiny delay for the UI to update to the "Checking..." state
    await new Promise(r => setTimeout(r, 100));

    const allowFullscreen = window.confirm("The assessment requires Full Screen mode. Click OK to allow Full Screen.");

    if (!allowFullscreen) {
      setSecureBrowserCheck('failed');
      if (videoStream) videoStream.getTracks().forEach(t => t.stop());
      if (audioStream) audioStream.getTracks().forEach(t => t.stop());
      setIsLoading(false);
      return;
    }

    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      setSecureBrowserCheck('passed');
    } catch (err) {
      console.error(`Error attempting to enable fullscreen:`, err);
      setSecureBrowserCheck('failed');
      if (videoStream) videoStream.getTracks().forEach(t => t.stop());
      if (audioStream) audioStream.getTracks().forEach(t => t.stop());
      setIsLoading(false);
      return;
    }

    const combinedStream = new MediaStream();
    videoStream.getVideoTracks().forEach(t => combinedStream.addTrack(t));
    audioStream.getAudioTracks().forEach(t => combinedStream.addTrack(t));
    setMediaStream(combinedStream);
    setIsLoading(false);
  }, []);

  const proceedToAssessment = useCallback(() => {
    if (allPassed && mediaStream) {
      startRecording(mediaStream);
      setScreen('LAUNCHER');
    }
  }, [allPassed, mediaStream, startRecording]);

  const goToLauncher = useCallback(() => {
    setScreen('LAUNCHER');
  }, []);

  // Monitor visibility change (Tab switching)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && (screen === 'LAUNCHER' || screen === 'PIPE_PUZZLE' || screen === 'BUBBLE_SORT')) {
        alert("WARNING: You have switched away from the secure environment. This activity has been logged.");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [screen]);

  // ─── Screen 1: Welcome / Terms ───
  if (screen === 'WELCOME') {
    return (
      <WelcomePage
        onTakeTest={handleTakeTestClick}
      />
    );
  }

  // ─── Screen 2: System Checks ───
  if (screen === 'SYSTEM_CHECKS') {
    return (
      <SystemChecksPage
        onProceed={proceedToAssessment}
        systemCheck={systemCheck}
        videoCheck={videoCheck}
        audioCheck={audioCheck}
        secureBrowserCheck={secureBrowserCheck}
        onRunChecks={runChecks}
        allPassed={allPassed}
        isLoading={isLoading}
      />
    );
  }

  // ─── Game Screens ───
  if (screen === 'PIPE_PUZZLE') {
    return (
      <div className="container">
        <button className="launcher-back-btn" onClick={goToLauncher}>← Back</button>
        <PipePuzzle />
      </div>
    );
  }

  if (screen === 'BUBBLE_SORT') {
    return (
      <>
        <ProctoringOverlay stream={mediaStream} />
        <BubbleSort onBack={goToLauncher} />
      </>
    );
  }

  // ─── Assessment Portal ───
  return (
    <div className="portal">
      <ProctoringOverlay stream={mediaStream} />

      <header className="portal-header">
        <div className="portal-header-inner">
          <span className="portal-logo">Assessment Portal</span>
          <span className="portal-header-right">Candidate Assessment</span>
        </div>
      </header>

      <main className="portal-main">
        <div className="portal-welcome">
          <h1 className="portal-title">Online Assessment</h1>
          <p className="portal-subtitle">
            This assessment contains multiple sections. Please complete each section within the allotted time.
            Ensure your browser is up to date and you have a stable internet connection before proceeding.
          </p>
        </div>

        <div className="portal-sections">
          <h2 className="portal-sections-title">Assessment Sections</h2>

          <div
            className="portal-section-row"
            onClick={() => setScreen('PIPE_PUZZLE')}
          >
            <div className="portal-section-num">1</div>
            <div className="portal-section-info">
              <h3 className="portal-section-name">Section 1 — Spatial Reasoning</h3>
              <p className="portal-section-desc">
                Connect pipes from source to destination by rotating tiles.
                Tests spatial reasoning and logical thinking.
              </p>
            </div>
            <div className="portal-section-meta">
              <span className="portal-meta-badge">3 Levels</span>
              <span className="portal-meta-time">~12 min</span>
            </div>
            <div className="portal-section-arrow">→</div>
          </div>

          <div
            className="portal-section-row"
            onClick={() => setScreen('BUBBLE_SORT')}
          >
            <div className="portal-section-num">2</div>
            <div className="portal-section-info">
              <h3 className="portal-section-name">Section 2 — Numerical Reasoning</h3>
              <p className="portal-section-desc">
                Evaluate mathematical expressions and sort values in ascending order.
                Tests numerical aptitude and algorithmic thinking.
              </p>
            </div>
            <div className="portal-section-meta">
              <span className="portal-meta-badge">20 Questions</span>
              <span className="portal-meta-time">7 min</span>
            </div>
            <div className="portal-section-arrow">→</div>
          </div>
        </div>

        <div className="portal-footer-note">
          <p>
            By starting this assessment, you agree to the terms and conditions.
            All responses are recorded and monitored.
          </p>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

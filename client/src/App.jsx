// Add at the very top of App.jsx, before any imports
// CACHE CLEARER VERSION 4.0 - AUTOMATIC ON DEPLOYMENT
const clearOldCache = () => {
    // Use build timestamp or deployment version
    const deploymentVersion = '4.0.0';
    const buildTime = '2026-05-04'; // Update this on each deployment
    const storedVersion = localStorage.getItem('app_version');
    const storedBuildTime = localStorage.getItem('app_build_time');
    
    // Force clear if version mismatch OR if build time is different
    if (storedVersion !== deploymentVersion || storedBuildTime !== buildTime) {
        console.log('🔄 Deployment detected! Clearing all cached data...');
        console.log(`   Old version: ${storedVersion}, New version: ${deploymentVersion}`);
        
        // Clear all localStorage
        localStorage.clear();
        
        // Clear all sessionStorage
        sessionStorage.clear();
        
        // Clear cookies
        document.cookie.split(";").forEach(function(c) { 
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
        });
        
        // Clear IndexedDB (Jitsi cache)
        if (window.indexedDB) {
            const databases = ['JitsiMeet', 'JitsiData', '8x8', 'jitsi', 'JitsiMeetExternalAPI'];
            databases.forEach(dbName => {
                try {
                    const request = window.indexedDB.deleteDatabase(dbName);
                    request.onsuccess = () => console.log(`  Deleted IndexedDB: ${dbName}`);
                    request.onerror = () => console.log(`  Could not delete: ${dbName}`);
                } catch(e) {
                    console.log(`  Error deleting ${dbName}:`, e.message);
                }
            });
        }
        
        // Clear Service Worker caches
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => {
                    if (name.includes('jitsi') || name.includes('8x8') || name.includes('meet')) {
                        caches.delete(name);
                        console.log(`  Deleted cache: ${name}`);
                    }
                });
            });
        }
        
        // Set new version markers
        localStorage.setItem('app_version', deploymentVersion);
        localStorage.setItem('app_build_time', buildTime);
        
        console.log('✅ Cache cleared for new deployment!');
        
        // Force reload to ensure clean state
        setTimeout(() => {
            window.location.reload();
        }, 100);
    } else {
        console.log('✅ Cache is up to date for version:', deploymentVersion);
    }
};

// Force clear Jitsi-specific caches on every load (aggressive)
const forceClearJitsiCache = () => {
    console.log('🧹 Force clearing Jitsi-specific caches...');
    
    // Clear all Jitsi-related storage keys
    const jitsiKeys = [
        'jitsiToken', 'jwt', 'jitsiJWT', 'jitsi-jwt', 'JitsiToken', 
        'JWT_TOKEN', 'jitsi_config_cache', 'jitsiMeetConfig', 
        'jitsiParticipant', '8x8_auth', 'vpaas-cookie'
    ];
    
    jitsiKeys.forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    });
    
    // Clear any keys containing these strings
    const clearPatterns = ['jitsi', '8x8', 'meet', 'jwt', 'token', 'vpaas'];
    [localStorage, sessionStorage].forEach(storage => {
        const keys = Object.keys(storage);
        keys.forEach(key => {
            const lowerKey = key.toLowerCase();
            if (clearPatterns.some(pattern => lowerKey.includes(pattern))) {
                storage.removeItem(key);
                console.log(`  Removed: ${key}`);
            }
        });
    });
};

// Run cache cleaners
clearOldCache();
forceClearJitsiCache();

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Editor from '@monaco-editor/react';
import { useParams, useNavigate } from 'react-router-dom';
import Draggable from 'react-draggable';
import jsPDF from 'jspdf'; 
import axios from 'axios';
import './App.css';

// Get backend URL from environment variable
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://peersync-backend.onrender.com";

console.log('🔗 Connecting to backend at:', BACKEND_URL);
console.log('📦 App Version: 4.0.0');

// Create axios instance with better error handling - NO CACHE HEADERS to avoid CORS
const api = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    "Bypass-Tunnel-Reminder": "true",
    "Content-Type": "application/json"
    // REMOVED: Cache-Control, Pragma, Expires - these cause CORS errors
  },
  withCredentials: true,
  timeout: 15000
});

// Socket with multiple transport fallbacks
const socket = io(BACKEND_URL, { 
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    autoConnect: true,
    forceNew: true,
    extraHeaders: {
        "Bypass-Tunnel-Reminder": "true"
    }
});

const starterCode = {
    python: "def main():\n    print('Hello from PeerSync Python!')\n\nif __name__ == '__main__':\n    main()",
    java: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello from PeerSync Java!\");\n    }\n}",
    javascript: "console.log('Hello from PeerSync JavaScript!');",
    cpp: "#include <iostream>\n\nint main() {\n    std::cout << \"Hello from PeerSync C++!\" << std::endl;\n    return 0;\n}"
};

export default function App() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const jitsiContainerRef = useRef(null);
    const recognitionRef = useRef(null);
    const jitsiApiRef = useRef(null);
    const draggableNodeRef = useRef(null);
    const keepAliveIntervalRef = useRef(null);

    const [language, setLanguage] = useState("javascript");
    const [code, setCode] = useState(starterCode.javascript);
    const [isDriver, setIsDriver] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [transcript, setTranscript] = useState(""); 
    const [isListening, setIsListening] = useState(false);
    const [currentSentence, setCurrentSentence] = useState("");
    const [remoteSubtitle, setRemoteSubtitle] = useState("");
    const [output, setOutput] = useState("");
    const [speechLang, setSpeechLang] = useState("en-US");
    const [jitsiToken, setJitsiToken] = useState("");
    const [jitsiActive, setJitsiActive] = useState(false);
    const [jitsiError, setJitsiError] = useState(false);
    const [tokenExpiry, setTokenExpiry] = useState(null);
    const [tokenDebug, setTokenDebug] = useState(null);
    const [jitsiRetryCount, setJitsiRetryCount] = useState(0);

    const [showAIOverlay, setShowAIOverlay] = useState(false);
    const [aiData, setAiData] = useState(null);
    const [isVideoMaximized, setIsVideoMaximized] = useState(false);
    const [driverName, setDriverName] = useState("Anonymous");
    const [activeTab, setActiveTab] = useState('logic');
    const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [connectionStatus, setConnectionStatus] = useState('connecting');
    const [transportType, setTransportType] = useState('unknown');

    // Hard reset function
    const hardReset = () => {
        if (confirm('This will clear all data and reset the app. Continue?')) {
            forceClearJitsiCache();
            localStorage.clear();
            sessionStorage.clear();
            document.cookie.split(";").forEach(function(c) { 
                document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
            });
            if ('caches' in window) {
                caches.keys().then(names => {
                    names.forEach(name => caches.delete(name));
                });
            }
            window.location.reload();
        }
    };

    // Enhanced auth check with token refresh - prevent infinite redirects
    useEffect(() => {
        let isMounted = true;
        const checkAuth = async () => {
            const token = localStorage.getItem('token');
            const refreshToken = localStorage.getItem('refreshToken');
            
            if (!token) {
                if (isMounted) navigate('/login');
                return;
            }
            
            try {
                const res = await api.get('/api/auth/me', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                
                if (res.data && isMounted) {
                    localStorage.setItem('userName', res.data.username);
                    console.log('Authenticated as:', res.data.username);
                }
            } catch (error) {
                console.error('Auth check failed:', error.message);
                
                // Don't redirect on CORS errors - just keep trying
                if (error.message === 'Network Error' && error.code === 'ERR_NETWORK') {
                    console.log('Network/CORS error, retrying in 2 seconds...');
                    setTimeout(checkAuth, 2000);
                    return;
                }
                
                // Only try refresh if we have a refresh token
                if (refreshToken) {
                    try {
                        const refreshRes = await api.post('/api/auth/refresh-token', { refreshToken });
                        if (refreshRes.data.token && isMounted) {
                            localStorage.setItem('token', refreshRes.data.token);
                            console.log('Token refreshed successfully');
                            return;
                        }
                    } catch (refreshError) {
                        console.error('Token refresh failed:', refreshError);
                    }
                }
                
                // Only redirect to login if not a network error
                if (isMounted && error.message !== 'Network Error') {
                    localStorage.removeItem('token');
                    localStorage.removeItem('refreshToken');
                    navigate('/login');
                }
            }
        };
        
        checkAuth();
        
        return () => {
            isMounted = false;
        };
    }, [navigate]);

    // Monitor socket connection
    useEffect(() => {
        console.log('Setting up socket connection...');
        
        const onConnect = () => {
            const transport = socket.io.engine.transport.name;
            console.log('✅ Socket connected! Transport:', transport);
            setConnectionStatus('connected');
            setTransportType(transport);
            addNotification('success', `Connected via ${transport}`);
        };

        const onConnectError = (error) => {
            console.error('❌ Socket connection error:', error.message);
            setConnectionStatus('error');
            addNotification('error', 'Connection failed - retrying...');
            
            if (socket.io.engine.transport.name === 'websocket') {
                console.log('Switching to polling transport...');
                socket.io.opts.transports = ['polling', 'websocket'];
            }
        };

        const onDisconnect = (reason) => {
            console.log('Socket disconnected:', reason);
            setConnectionStatus('disconnected');
            addNotification('warning', 'Disconnected from server');
        };

        const onReconnect = (attempt) => {
            console.log('Socket reconnected after', attempt, 'attempts');
            setConnectionStatus('connected');
            addNotification('success', 'Reconnected to server');
        };

        socket.on('connect', onConnect);
        socket.on('connect_error', onConnectError);
        socket.on('disconnect', onDisconnect);
        socket.on('reconnect', onReconnect);

        return () => {
            socket.off('connect', onConnect);
            socket.off('connect_error', onConnectError);
            socket.off('disconnect', onDisconnect);
            socket.off('reconnect', onReconnect);
        };
    }, []);

    // Fetch Jitsi token with aggressive cache busting
    const getJitsiToken = async () => {
        try {
            // Clear any cached token first
            sessionStorage.removeItem('jitsiToken');
            localStorage.removeItem('jitsiToken');
            
            console.log('🔄 Fetching FRESH Jitsi token for room:', roomId);
            const userName = localStorage.getItem('userName') || "PeerSync User";
            const userId = localStorage.getItem('userId') || "peersync-user-1";
            
            // Multiple cache-busting parameters
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(7);
            
            const res = await api.get('/api/jitsi-token', {
                params: {
                    room: roomId,
                    userName: userName,
                    userId: userId,
                    _t: timestamp,
                    _r: random,
                    _nocache: timestamp
                }
            });
            
            const receivedToken = res.data.token;
            
            // Decode and verify token
            try {
                const tokenParts = receivedToken.split('.');
                if (tokenParts.length === 3) {
                    const header = JSON.parse(atob(tokenParts[0]));
                    console.log('📋 Token Header:', header);
                    console.log('🔑 Algorithm:', header.alg);
                    console.log('🔐 Has kid:', !!header.kid);
                    
                    setTokenDebug({
                        algorithm: header.alg,
                        hasKid: !!header.kid,
                        kid: header.kid || 'MISSING'
                    });
                    
                    if (header.alg !== 'RS256') {
                        console.error('❌ Wrong algorithm! Expected RS256, got:', header.alg);
                        addNotification('error', `Wrong token algorithm: ${header.alg}`);
                        setJitsiError(true);
                        return;
                    }
                    
                    if (!header.kid) {
                        console.error('❌ Missing kid in token header!');
                        addNotification('error', 'Missing Key ID in token');
                        setJitsiError(true);
                        return;
                    }
                    
                    console.log('✅ Token validation passed! Using RS256 with kid');
                    addNotification('success', `Video auth: RS256`);
                }
            } catch (decodeError) {
                console.error('Failed to decode token:', decodeError);
            }
            
            setJitsiToken(receivedToken);
            setTokenExpiry(res.data.expiresAt);
            
            // Refresh Jitsi if already initialized
            if (jitsiApiRef.current) {
                console.log('Re-initializing Jitsi with new token...');
                jitsiApiRef.current.dispose();
                jitsiApiRef.current = null;
                setTimeout(() => initJitsi(), 500);
            }
            
        } catch (err) {
            console.error("❌ JWT Fetch Failed:", err.message);
            addNotification('error', 'Failed to initialize video call');
            setJitsiError(true);
        }
    };

    useEffect(() => {
        if (roomId) {
            getJitsiToken();
        }
    }, [roomId]);

    // Speech Recognition
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            if (recognitionRef.current) recognitionRef.current.stop();
            
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = speechLang;

            recognitionRef.current.onresult = (event) => {
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const resultText = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        setTranscript(prev => prev + " " + resultText);
                        if (socket.connected) {
                            socket.emit("send_caption", { roomId, text: resultText });
                        }
                        setCurrentSentence(""); 
                    } else {
                        interimTranscript += resultText;
                        setCurrentSentence(interimTranscript);
                    }
                }
            };

            recognitionRef.current.onerror = (event) => {
                console.error("Speech recognition error:", event.error);
                setIsListening(false);
                if (event.error === 'not-allowed') {
                    addNotification('error', 'Microphone access denied');
                }
            };

            if (isListening && socket.connected) {
                try { 
                    recognitionRef.current.start(); 
                    console.log('🎤 Speech recognition started');
                } catch(e) { 
                    console.error(e);
                    setIsListening(false);
                }
            }
        } else {
            console.warn('Speech recognition not supported');
            addNotification('warning', 'Speech recognition not supported in this browser');
        }
        
        return () => { 
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch(e) {}
            }
        };
    }, [speechLang, isListening, roomId]);

    // Jitsi initialization with RS256 token and correct room format
    const initJitsi = () => {
        if (window.JitsiMeetExternalAPI && jitsiContainerRef.current && jitsiToken) {
            try {
                setJitsiActive(true);
                const domain = "8x8.vc";
                
                // CRITICAL FIX: Use the correct room name format with app ID
                const appId = "vpaas-magic-cookie-8f291ebf52794eb5896baaed63b01738";
                const formattedRoomName = `${appId}/${roomId}`;  // This is the correct format!
                
                console.log('🎥 Initializing Jitsi with room:', formattedRoomName);
                console.log('🔑 Token algorithm verification passed');
                console.log('📝 Original roomId:', roomId);
                
                const options = {
                    roomName: formattedRoomName,  // Use formatted room name
                    jwt: jitsiToken,
                    width: "100%", 
                    height: "100%",
                    parentNode: jitsiContainerRef.current,
                    configOverwrite: { 
                        prejoinPageEnabled: false,
                        startWithAudioMuted: true,
                        startWithVideoMuted: false,
                        disableDeepLinking: true,
                        enableWelcomePage: false,
                        channelLastN: -1,  // Allow all participants
                        disabledSounds: [],
                        defaultLanguage: 'en',
                        disableInviteFunctions: false,
                        disableProfile: false,
                        enableCalendarIntegration: false,
                        enableEmailIntegration: false,
                        enableGoogleAPIs: false,
                        p2p: { enabled: true },  // Enable P2P for better connection
                        resolution: 720,
                        hosts: {
                            domain: '8x8.vc',
                            muc: 'conference.8x8.vc',
                            focus: 'focus.8x8.vc'
                        },
                        constraints: {
                            video: {
                                height: { ideal: 720, max: 720, min: 180 }
                            }
                        }
                    },
                    interfaceConfigOverwrite: { 
                        TILE_VIEW_MAX_COLUMNS: 4,
                        SHOW_JITSI_WATERMARK: false,
                        SHOW_BRAND_WATERMARK: false,
                        TOOLBAR_BUTTONS: [
                            'microphone', 'camera', 'closedcaptions', 'desktop', 
                            'fullscreen', 'fodeviceselection', 'hangup', 
                            'profile', 'chat', 'settings', 'raisehand',
                            'videoquality', 'tileview', 'shareroom'
                        ],
                        SETTINGS_SECTIONS: ['devices', 'language', 'moderator', 'profile']
                    }
                };

                jitsiApiRef.current = new window.JitsiMeetExternalAPI(domain, options);
                
                jitsiApiRef.current.addListener('videoConferenceJoined', () => {
                    console.log('✅ Jitsi conference joined successfully!');
                    addNotification('success', 'Video call connected!');
                    setJitsiError(false);
                    setJitsiRetryCount(0);
                });
                
                jitsiApiRef.current.addListener('videoConferenceLeft', () => {
                    console.log('Jitsi conference left');
                    setJitsiActive(false);
                });
                
                jitsiApiRef.current.addListener('connectionEstablished', () => {
                    console.log('Jitsi connection established');
                });
                
                jitsiApiRef.current.addListener('connectionFailed', (error) => {
                    console.error('Jitsi connection failed:', error);
                    setJitsiError(true);
                    addNotification('error', `Video connection failed (Attempt ${jitsiRetryCount + 1}/3)`);
                    
                    // Auto retry up to 3 times
                    if (jitsiRetryCount < 3) {
                        setTimeout(() => {
                            console.log(`🔄 Retrying Jitsi connection (${jitsiRetryCount + 1}/3)...`);
                            setJitsiRetryCount(prev => prev + 1);
                            if (jitsiApiRef.current) {
                                jitsiApiRef.current.dispose();
                                jitsiApiRef.current = null;
                            }
                            setTimeout(() => initJitsi(), 1000);
                        }, 3000);
                    }
                });
                
                jitsiApiRef.current.addListener('readyToClose', () => {
                    console.log('Jitsi ready to close');
                });
                
            } catch (error) {
                console.error('Jitsi initialization error:', error);
                setJitsiError(true);
                addNotification('error', 'Failed to initialize video call');
            }
        } else if (!window.JitsiMeetExternalAPI) {
            console.log('Waiting for Jitsi API to load...');
            setTimeout(() => {
                if (jitsiToken && !jitsiApiRef.current) {
                    console.log('Retrying Jitsi initialization...');
                    initJitsi();
                }
            }, 1000);
        }
    };

    // Keep connection alive for long calls
    const startKeepAlive = () => {
        if (keepAliveIntervalRef.current) {
            clearInterval(keepAliveIntervalRef.current);
        }
        
        keepAliveIntervalRef.current = setInterval(() => {
            if (jitsiApiRef.current && jitsiActive) {
                try {
                    jitsiApiRef.current.executeCommand('toggleTileView');
                    setTimeout(() => {
                        if (jitsiApiRef.current) {
                            jitsiApiRef.current.executeCommand('toggleTileView');
                        }
                    }, 100);
                    console.log('💓 Jitsi keep-alive ping');
                } catch (e) {
                    console.warn('Keep-alive failed:', e);
                }
            }
            
            if (!socket.connected) {
                console.log('Reconnecting socket...');
                socket.connect();
            }
        }, 25 * 60 * 1000);
    };

    // Room and socket setup
    useEffect(() => {
        if (jitsiToken && roomId && socket.connected) {
            if (!window.JitsiMeetExternalAPI) {
                const script = document.createElement('script');
                script.src = 'https://8x8.vc/vpaas-magic-cookie-8f291ebf52794eb5896baaed63b01738/external_api.js';
                script.async = true;
                script.onload = () => {
                    console.log('Jitsi API loaded, initializing...');
                    initJitsi();
                    startKeepAlive();
                };
                script.onerror = () => {
                    console.error('Failed to load Jitsi API');
                    setJitsiError(true);
                    addNotification('error', 'Failed to load video call library');
                };
                document.body.appendChild(script);
            } else {
                initJitsi();
                startKeepAlive();
            }
            
            const myName = localStorage.getItem('userName') || "User_" + Math.floor(Math.random() * 1000);
            socket.emit('join_room', { roomId, userName: myName });
            
            setTimeout(() => {
                socket.emit('request_driver_info', { roomId });
            }, 500);

            const onInitialCode = (savedCode) => {
                setCode(savedCode);
                console.log('Initial code loaded');
            };
            
            const onCodeUpdate = (newCode) => {
                setCode(newCode);
            };
            
            const onDriverChanged = ({ driverId, driverName: newDriverName }) => {
                const amIDriver = socket.id === driverId;
                setIsDriver(amIDriver);
                setDriverName(newDriverName);
                addNotification('info', amIDriver ? '👑 You are the driver!' : `👤 ${newDriverName} is driving`);
                console.log('Driver changed:', amIDriver ? 'You are driver' : `${newDriverName} is driver`);
            };
            
            const onReceiveCaption = (data) => {
                const text = speechLang.startsWith('hi') ? data.hi : data.en;
                setRemoteSubtitle(text);
                setTimeout(() => setRemoteSubtitle(""), 4000);
            };
            
            const onReceiveSummary = (data) => {
                setAiData(data);
                setShowAIOverlay(true);
                setActiveTab('logic');
                addNotification('success', '📚 AI Summary generated!');
            };
            
            const onReceiveOutput = (remoteOutput) => {
                setOutput(remoteOutput);
            };
            
            const onReceiveLanguage = (lang) => {
                setLanguage(lang);
            };
            
            const onNotification = (notification) => {
                addNotification(notification.type || 'info', notification.message);
            };

            socket.on('initial_code', onInitialCode);
            socket.on('code_update', onCodeUpdate);
            socket.on('driver_changed', onDriverChanged);
            socket.on('receive_caption', onReceiveCaption);
            socket.on('receive_summary', onReceiveSummary);
            socket.on('receive_output', onReceiveOutput);
            socket.on('receive_language', onReceiveLanguage);
            socket.on('notification', onNotification);

            return () => { 
                socket.off('initial_code', onInitialCode);
                socket.off('code_update', onCodeUpdate);
                socket.off('driver_changed', onDriverChanged);
                socket.off('receive_caption', onReceiveCaption);
                socket.off('receive_summary', onReceiveSummary);
                socket.off('receive_output', onReceiveOutput);
                socket.off('receive_language', onReceiveLanguage);
                socket.off('notification', onNotification);
                
                if (keepAliveIntervalRef.current) {
                    clearInterval(keepAliveIntervalRef.current);
                }
                
                if (jitsiApiRef.current) {
                    jitsiApiRef.current.dispose();
                    jitsiApiRef.current = null;
                }
            };
        }
    }, [roomId, jitsiToken, socket.connected]);

    const addNotification = (type, message) => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, type, message }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 4000);
    };

    const runCode = async () => {
        setIsRunning(true);
        setOutput("🚀 Running...");
        try {
            const res = await api.post('/api/execute', { language, code });
            const result = res.data.output || "No output.";
            setOutput(result);
            if (socket.connected) {
                socket.emit("share_output", { roomId, output: result });
            }
            addNotification('success', 'Code executed');
        } catch (error) { 
            setOutput(`❌ Error: ${error.response?.data?.error || error.message}`);
            addNotification('error', 'Execution failed');
        } finally { 
            setIsRunning(false); 
        }
    };

    const generateNotes = async () => {
        setIsGenerating(true);
        try {
            const response = await api.post('/api/summarize', { roomId, transcript, code });
            if (response.data) {
                setAiData(response.data);
                setShowAIOverlay(true);
                if (socket.connected) {
                    socket.emit("share_summary", { roomId, aiData: response.data });
                }
                addNotification('success', 'AI Summary ready');
            }
        } catch (error) { 
            setOutput("❌ AI failed."); 
            addNotification('error', 'AI summary failed');
        } finally { 
            setIsGenerating(false); 
        }
    };

    const handleLanguageChange = (newLang) => {
        if (isDriver) {
            setLanguage(newLang);
            setCode(starterCode[newLang] || code); 
            if (socket.connected) {
                socket.emit("language_change", { roomId, language: newLang });
            }
        }
    };

    const handleLayoutToggle = () => {
        setIsVideoMaximized(!isVideoMaximized);
        setTimeout(() => {
            if (jitsiApiRef.current) {
                jitsiApiRef.current.executeCommand('toggleTileView');
            }
        }, 100);
    };

    const requestToDrive = () => {
        const name = prompt("Enter your name:", localStorage.getItem('userName') || "PeerSync Coder");
        if (name && socket.connected) {
            localStorage.setItem('userName', name);
            socket.emit("claim_driver", { roomId, name });
            addNotification('info', `Requested to become driver as ${name}`);
        }
    };

    const downloadPDF = () => {
        if (!aiData) return;
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text("Code Logic & Summary Report", 10, 20);
        doc.setFontSize(12);
        doc.text(`Language: ${language}`, 10, 30);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 10, 40);
        doc.text("Logic Explanation:", 10, 50);
        doc.text(aiData.logic || aiData.summary || "No data", 10, 60, { maxWidth: 180 });
        
        if (aiData.flashcards?.length) {
            doc.addPage();
            doc.setFontSize(16);
            doc.text("Practice Questions", 10, 20);
            doc.setFontSize(12);
            let yPos = 40;
            aiData.flashcards.forEach((card, index) => {
                if (yPos > 280) {
                    doc.addPage();
                    yPos = 40;
                }
                doc.text(`Q${index + 1}: ${card.q || card.question}`, 10, yPos);
                doc.text(`A: ${card.a || card.answer}`, 10, yPos + 15);
                yPos += 40;
            });
        }
        doc.save(`PeerSync_Notes_${roomId}.pdf`);
        addNotification('success', 'PDF downloaded');
    };

    // Debug token function
    const debugToken = async () => {
        console.log('🔍 Debugging token...');
        try {
            const freshToken = await api.get('/api/jitsi-token', {
                params: {
                    room: roomId,
                    userName: localStorage.getItem('userName') || "Test",
                    userId: "debug-user",
                    _debug: Date.now()
                }
            });
            
            const token = freshToken.data.token;
            const parts = token.split('.');
            const header = JSON.parse(atob(parts[0]));
            
            const message = `Token Info:\nAlgorithm: ${header.alg}\nHas KID: ${!!header.kid}\nKID: ${header.kid || 'MISSING!'}\n\n${header.alg === 'RS256' && header.kid ? '✅ Token looks correct!' : '❌ Token is WRONG!'}`;
            alert(message);
            console.log('Debug token header:', header);
        } catch(e) {
            alert('Error fetching token: ' + e.message);
        }
    };

    // Connection error screen
    if (connectionStatus === 'error' && !socket.connected) {
        return (
            <div className="connection-error">
                <h2>🔌 Connection Error</h2>
                <p>Unable to connect to server at:</p>
                <code>{BACKEND_URL}</code>
                <p>Please check:</p>
                <ul>
                    <li>Backend is running (node server.js)</li>
                    <li>Tunnel is active (cloudflared)</li>
                    <li>URL in .env is correct</li>
                </ul>
                <button onClick={() => window.location.reload()}>Refresh Page</button>
                <button onClick={() => socket.connect()} style={{marginLeft: '10px'}}>Retry Connection</button>
            </div>
        );
    }

    return (
        <div className="app-container">
            <div className="status-bar">
                <div className={`connection-status ${connectionStatus}`}>
                    {connectionStatus === 'connected' && `🟢 Connected (${transportType})`}
                    {connectionStatus === 'connecting' && '🟡 Connecting...'}
                    {connectionStatus === 'disconnected' && '🔴 Disconnected'}
                    {connectionStatus === 'error' && '🔴 Connection Error'}
                </div>
                <div className="room-info">
                    Room: {roomId}
                </div>
                {tokenExpiry && (
                    <div className="token-info">
                        🔑 Expires: {new Date(tokenExpiry * 1000).toLocaleTimeString()}
                    </div>
                )}
                {tokenDebug && (
                    <div className="token-debug" style={{fontSize: '10px', marginLeft: '10px'}}>
                        {tokenDebug.algorithm === 'RS256' ? '✅' : '❌'} {tokenDebug.algorithm}
                    </div>
                )}
            </div>

            <div className="notification-container">
                {notifications.map(notif => (
                    <div key={notif.id} className={`notification ${notif.type}`}>
                        {notif.message}
                    </div>
                ))}
            </div>

            <div className="main-workspace">
                <div className="toolbar">
                    <div className="logo-text">PeerSync</div>
                    
                    <div className="subtitle-controls">
                        <div className="language-selector">
                            <span className="selector-label">🌐</span>
                            <select 
                                value={speechLang} 
                                onChange={(e) => setSpeechLang(e.target.value)}
                                className="speech-lang-select"
                            >
                                <option value="en-US">🇺🇸 English</option>
                                <option value="hi-IN">🇮🇳 हिंदी</option>
                            </select>
                        </div>
                        <button 
                            onClick={() => setIsListening(!isListening)} 
                            className={`mic-button ${isListening ? 'active' : ''}`}
                            disabled={!socket.connected}
                        >
                            <span className="button-icon">{isListening ? '⏹️' : '🎙️'}</span>
                            <span className="button-text">{isListening ? 'Stop' : 'Speak'}</span>
                        </button>
                    </div>

                    <select 
                        value={language} 
                        onChange={(e) => handleLanguageChange(e.target.value)} 
                        className="language-select"
                        disabled={!isDriver}
                    >
                        <option value="javascript">JavaScript</option>
                        <option value="python">Python</option>
                        <option value="java">Java</option>
                        <option value="cpp">C++</option>
                    </select>
                    
                    <button 
                        onClick={runCode} 
                        disabled={isRunning || !isDriver} 
                        className="run-button"
                    >
                        <span className="button-icon">⚡</span>
                        <span>{isRunning ? "Running..." : "Run Code"}</span>
                    </button>
                    
                    <button 
                        onClick={generateNotes} 
                        disabled={isGenerating || !isDriver} 
                        className="summary-button"
                    >
                        <span className="button-icon">🤖</span>
                        <span>{isGenerating ? "Analyzing..." : "AI Summary"}</span>
                    </button>
                    
                    <button onClick={debugToken} className="debug-button" title="Debug Token">
                        🔍 Debug
                    </button>
                    
                    <button onClick={hardReset} className="reset-button" title="Clear all data and reset">
                        🗑️ Reset
                    </button>
                    
                    {!isDriver ? (
                        <button onClick={requestToDrive} className="request-button" disabled={!socket.connected}>
                            <span className="button-icon">⌨️</span>
                            <span>Request Control</span>
                        </button>
                    ) : (
                        <div className="driver-badge">
                            <span className="driver-icon">👑</span>
                            <span className="driver-text">
                                <span className="driver-label">Driver:</span>
                                <span className="driver-name">{driverName}</span>
                            </span>
                        </div>
                    )}
                </div>

                <Editor
                    height="65%"
                    theme="vs-dark"
                    language={language}
                    value={code}
                    onChange={(val) => { 
                        if(isDriver && val !== code && socket.connected) { 
                            setCode(val); 
                            socket.emit('code_update', { roomId, code: val }); 
                        } 
                    }}
                    options={{ 
                        fontSize: 16, 
                        readOnly: !isDriver,
                        automaticLayout: true,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false
                    }}
                />
                
                <div className="output-panel">
                    <pre className="output-content">{output || "> Code output will appear here..."}</pre>
                </div>

                {(currentSentence || remoteSubtitle) && (
                    <div className="subtitle-overlay">
                        {currentSentence || remoteSubtitle}
                    </div>
                )}

                {showAIOverlay && aiData && (
                    <Draggable nodeRef={draggableNodeRef} handle=".drag-handle">
                        <div ref={draggableNodeRef} className="ai-summary-window">
                            <div className="drag-handle summary-heading">
                                <span>🧠 AI Assistant</span>
                                <div className="summary-actions">
                                    <button onClick={downloadPDF} className="pdf-button">📄 PDF</button>
                                    <button onClick={() => setShowAIOverlay(false)} className="close-button">✕</button>
                                </div>
                            </div>
                            
                            <div className="summary-tabs">
                                <button 
                                    className={`tab-button ${activeTab === 'logic' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('logic')}
                                >
                                    📝 Logic
                                </button>
                                <button 
                                    className={`tab-button ${activeTab === 'flashcards' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('flashcards')}
                                >
                                    🎴 Questions
                                </button>
                            </div>

                            <div className="summary-content">
                                {activeTab === 'logic' && (
                                    <div className="logic-section">
                                        <div className="logic-card">
                                            <h4>🎯 Approach</h4>
                                            <p>{aiData.approach || "No approach data available"}</p>
                                        </div>
                                        <div className="logic-card">
                                            <h4>💡 Logic</h4>
                                            <p>{aiData.logic || aiData.summary || "No logic data available"}</p>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'flashcards' && aiData.flashcards?.length > 0 && (
                                    <div className="flashcards-section">
                                        <div className="flashcard">
                                            <span className="question-number">
                                                Q{currentFlashcardIndex + 1}/{aiData.flashcards.length}
                                            </span>
                                            <p className="question">
                                                {aiData.flashcards[currentFlashcardIndex].q || 
                                                 aiData.flashcards[currentFlashcardIndex].question}
                                            </p>
                                            <p className="answer">
                                                <strong>Answer:</strong> {
                                                    aiData.flashcards[currentFlashcardIndex].a || 
                                                    aiData.flashcards[currentFlashcardIndex].answer
                                                }
                                            </p>
                                        </div>
                                        <div className="flashcard-navigation">
                                            <button onClick={() => setCurrentFlashcardIndex(
                                                prev => prev > 0 ? prev - 1 : aiData.flashcards.length - 1
                                            )}>←</button>
                                            <div className="dots">
                                                {aiData.flashcards.map((_, i) => (
                                                    <span 
                                                        key={i}
                                                        className={`dot ${i === currentFlashcardIndex ? 'active' : ''}`}
                                                        onClick={() => setCurrentFlashcardIndex(i)}
                                                    />
                                                ))}
                                            </div>
                                            <button onClick={() => setCurrentFlashcardIndex(
                                                prev => prev < aiData.flashcards.length - 1 ? prev + 1 : 0
                                            )}>→</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Draggable>
                )}
            </div>

            <div className={`video-panel ${isVideoMaximized ? 'maximized' : ''}`}>
                <button onClick={handleLayoutToggle} className="video-toggle" title={isVideoMaximized ? 'Minimize' : 'Maximize'}>
                    {isVideoMaximized ? '▶' : '◀'}
                </button>
                <div ref={jitsiContainerRef} className={`jitsi-container ${jitsiActive ? 'active' : ''}`}>
                    {!jitsiToken && !jitsiError && (
                        <div className="auth-message">
                            <div className="spinner"></div>
                            <p>🔐 Authenticating with 8x8...</p>
                        </div>
                    )}
                    {jitsiError && (
                        <div className="jitsi-error">
                            <p>❌ Video call connection failed</p>
                            <p style={{fontSize: '12px', color: '#ccc'}}>Retry attempt: {jitsiRetryCount}/3</p>
                            <button onClick={() => {
                                setJitsiError(false);
                                setJitsiToken("");
                                setJitsiRetryCount(prev => prev + 1);
                                setTimeout(() => getJitsiToken(), 1000);
                            }}>
                                Retry Connection
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
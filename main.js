// Spotify OAuth Authorization Code Flow with PKCE
const SPOTIFY_CLIENT_ID = window.SPOTIFY_CLIENT_ID;
const REDIRECT_URI = window.REDIRECT_URI;
const SCOPES = window.CONFIG?.SPOTIFY_SCOPES;

// PKCE Hilfsfunktionen
function generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function getAuthorizationCode() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('code');
}

async function exchangeCodeForToken(authCode) {
    const codeVerifier = localStorage.getItem('spotify_code_verifier');
    if (!codeVerifier) {
        throw new Error('Code verifier not found');
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: authCode,
            redirect_uri: REDIRECT_URI,
            client_id: SPOTIFY_CLIENT_ID,
            code_verifier: codeVerifier,
        }),
    });

    if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.status}`);
    }

    const data = await response.json();
    return data.access_token;
}

async function redirectToSpotifyAuth() {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    // Code verifier für später speichern
    localStorage.setItem('spotify_code_verifier', codeVerifier);
    
    const authUrl = `https://accounts.spotify.com/authorize?` +
        `client_id=${SPOTIFY_CLIENT_ID}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&code_challenge_method=S256` +
        `&code_challenge=${codeChallenge}` +
        `&scope=${encodeURIComponent(SCOPES)}`;
    
    window.location.href = authUrl;
}

async function getAccessToken() {
    // 1. Bereits gespeichertes Token?
    let token = localStorage.getItem('spotifyAccessToken');
    if (token) {
        return token;
    }
    
    // 2. Authorization Code in URL?
    const authCode = getAuthorizationCode();
    if (authCode) {
        try {
            token = await exchangeCodeForToken(authCode);
            localStorage.setItem('spotifyAccessToken', token);
            localStorage.removeItem('spotify_code_verifier'); // Code verifier nicht mehr benötigt
            
            // URL bereinigen
            window.history.replaceState({}, document.title, window.location.pathname);
            return token;
        } catch (error) {
            console.error('Token exchange failed:', error);
            localStorage.removeItem('spotify_code_verifier');
            return null;
        }
    }
    
    return null;
}

// Store token globally for API calls
getAccessToken().then(token => {
    spotifyAccessToken = token;
    
    if (!spotifyAccessToken) {
        // Not authenticated, start OAuth flow
        updateSpotifyStatus('Spotify login required...', 'orange');
        redirectToSpotifyAuth();
    } else {
        // Token available, ready for API calls
        console.log('Spotify Access Token:', spotifyAccessToken);
        updateSpotifyStatus('Spotify logged in, initializing player...', 'blue');
        
        // Example API call function
        window.spotifyApiCall = async function(endpoint) {
            const res = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
                headers: { Authorization: `Bearer ${spotifyAccessToken}` }
            });
            return res.json();
        };
        
        // Initialisiere den Spotify Web Player
        if (window.Spotify) {
            initializeSpotifyPlayer(spotifyAccessToken);
        } else {
            // Falls SDK noch nicht geladen, warte darauf
            window.addEventListener('SpotifySDKReady', () => {
                initializeSpotifyPlayer(spotifyAccessToken);
            });
        }
    }
});

// QR-Code Scanner Integration mit html5-qrcode
// Hinweis: <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script> im index.html einbinden

let availableCameras = [];
let currentQrScanner = null;

function populateCameraSelect(cameras) {
    const cameraSelect = document.getElementById('camera-select');
    const cameraSelection = document.getElementById('camera-selection');
    
    cameraSelect.innerHTML = '';
    availableCameras = cameras;
    
    cameras.forEach((camera, index) => {
        const option = document.createElement('option');
        option.value = camera.id;
        option.textContent = camera.label || `Camera ${index + 1}`;
        cameraSelect.appendChild(option);
    });
    
    // Always show camera selection when cameras are found
    if (cameras.length > 0) {
        cameraSelection.style.display = 'block';
        console.log(`${cameras.length} camera(s) found, showing selection`);
    }
}

function startQrScanner(cameraId) {
    const scannerContainer = document.getElementById('qr-scanner');
    
    // Clear container for new scanner
    scannerContainer.innerHTML = '';
    
    // Stop previous scanner if available and running
    if (currentQrScanner) {
        try {
            // Check if scanner is actually running before stopping
            if (currentQrScanner.getState() === Html5QrcodeScannerState.SCANNING) {
                currentQrScanner.stop().catch(err => console.log('Error stopping scanner:', err));
            }
        } catch (error) {
            console.log('Scanner state check failed, creating new scanner:', error);
        }
        currentQrScanner = null;
    }
    
    currentQrScanner = new Html5Qrcode('qr-scanner');
    
    // Mobile-optimized scanner configuration
    const config = {
        fps: 10,
        qrbox: function(viewfinderWidth, viewfinderHeight) {
            // Mobile responsive QR box
            const minEdgePercentage = 0.7;
            const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
            const qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
            return {
                width: qrboxSize,
                height: qrboxSize
            };
        },
        aspectRatio: 1.0
    };
    
    currentQrScanner.start(
        cameraId,
        config,
        (decodedText, decodedResult) => {
            console.log('QR code detected:', decodedText);
            // QR code detected
            let trackId = null;
            let urlMatch = decodedText.match(/https?:\/\/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
            if (urlMatch) {
                trackId = urlMatch[1];
                console.log('Spotify Track ID:', trackId);
                console.log('Spotify Track URL:', decodedText);
                playSpotifyTrack(trackId);
            } else if (/^[a-zA-Z0-9]{22}$/.test(decodedText)) {
                // Direct track ID
                trackId = decodedText;
                console.log('Spotify Track ID:', trackId);
                playSpotifyTrack(trackId);
            } else {
                console.log('No Spotify track recognized:', decodedText);
                // Show user-friendly message for non-Spotify QR codes
                alert('This QR code is not a Spotify track. Please scan a Spotify track QR code.');
            }
            currentQrScanner.stop().then(() => {
                console.log('Scanner stopped after QR code detection');
                currentQrScanner = null; // Clear reference after stopping
                
                // Remove loading animation
                const statusText = document.getElementById('status-text');
                if (statusText) {
                    statusText.classList.remove('loading');
                }
                
                // Re-enable scan button for next scan
                const startButton = document.getElementById('startButton');
                if (startButton) {
                    startButton.textContent = 'Scan QR Code';
                    startButton.disabled = false;
                }
            }).catch(err => {
                console.log('Error stopping scanner after detection:', err);
                currentQrScanner = null; // Clear reference even if stop failed
            });
        },
        (errorMessage) => {
            // Fehler beim Scannen - nicht loggen, da das normal ist
        }
    ).catch(err => {
        console.error('Error starting QR scanner:', err);
        alert('Camera access failed. Make sure you are using HTTPS and have granted camera permissions.');
        
        // Re-enable scan button on error
        const startButton = document.getElementById('startButton');
        if (startButton) {
            startButton.textContent = 'Scan QR Code';
            startButton.disabled = false;
        }
        
        currentQrScanner = null;
    });
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, looking for buttons...');
    const startButton = document.getElementById('startButton');
    const useSelectedCameraButton = document.getElementById('use-selected-camera');
    const cameraSelect = document.getElementById('camera-select');
    const resetAuthButton = document.getElementById('reset-auth');
    
    console.log('Found startButton:', startButton);
    
    if (!startButton) {
        console.error('startButton not found!');
        return;
    }

    // Initially disable the scan button until camera is selected
    startButton.disabled = true;
    startButton.textContent = 'Select Camera First';
    startButton.style.opacity = '0.6';

    // Load cameras on page load and show camera selection immediately
    console.log('Loading available cameras...');
    if (typeof Html5Qrcode === 'undefined') {
        console.error('Html5Qrcode library not loaded!');
        alert('QR code library not loaded. Please reload the page.');
        return;
    }

    Html5Qrcode.getCameras().then(devices => {
        console.log('Available cameras:', devices);
        if (devices && devices.length) {
            populateCameraSelect(devices);
            console.log('Camera selection is now visible');
        } else {
            console.error('No cameras found');
            alert('No camera found');
            startButton.textContent = 'No Camera Available';
        }
    }).catch(err => {
        console.error('Error getting cameras:', err);
        alert('Error accessing cameras: ' + err.message);
        startButton.textContent = 'Camera Error';
    });

    // Event Listener for camera selection
    if (useSelectedCameraButton && cameraSelect) {
        useSelectedCameraButton.addEventListener('click', function() {
            const selectedCameraId = cameraSelect.value;
            if (selectedCameraId) {
                console.log('Camera selected:', selectedCameraId);
                
                // Add visual feedback
                this.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    this.style.transform = '';
                }, 150);
                
                // Enable the scan button
                startButton.disabled = false;
                startButton.textContent = 'Scan QR Code';
                startButton.style.opacity = '1';
                
                // Store selected camera for later use
                window.selectedCameraId = selectedCameraId;
                
                // Hide camera selection
                document.getElementById('camera-selection').style.display = 'none';
                
                console.log('Scan button is now active');
            } else {
                alert('Please select a camera first.');
            }
        });
    }

    // Modified scan button event listener
    startButton.addEventListener('click', function() {
        if (this.disabled) {
            return; // Button is disabled
        }
        
        console.log('Scan QR Code button clicked!');
        
        // Add visual feedback for mobile
        this.style.transform = 'scale(0.95)';
        setTimeout(() => {
            this.style.transform = '';
        }, 150);
        
        // Check scanner container
        let scannerContainer = document.getElementById('qr-scanner');
        if (!scannerContainer) {
            console.error('qr-scanner container not found!');
            return;
        }

        // Use the previously selected camera
        if (window.selectedCameraId) {
            console.log('Starting scanner with selected camera:', window.selectedCameraId);
            
            // Disable button during scanning to prevent multiple clicks
            this.textContent = 'Scanning...';
            this.disabled = true;
            
            startQrScanner(window.selectedCameraId);
        } else {
            alert('No camera selected. Please select a camera first.');
        }
    });
    
    // Event Listener for Login Again Button
    if (resetAuthButton) {
        resetAuthButton.addEventListener('click', function() {
            console.log('Reset Auth button clicked');
            
            // Add visual feedback
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
            
            logout();
            // Wait briefly and then reload for OAuth
            setTimeout(() => {
                window.location.reload();
            }, 500);
        });
    }
    
    console.log('Event listeners added');
});

let spotifyPlayer = null;
let spotifyDeviceId = null;
let spotifyAccessToken = null;

function initializeSpotifyPlayer(accessToken) {
    console.log('Initializing Spotify Player...');
    updateSpotifyStatus('Starting player...', 'blue');
    
    const initPlayer = async () => {
        console.log('Spotify Web Playback SDK ready - validating token...');
        
        // Validate token before player initialization
        const tokenValid = await validateAndRefreshToken();
        if (!tokenValid) {
            console.error('Token invalid, restarting OAuth flow');
            redirectToSpotifyAuth();
            return;
        }
        
        console.log('Token valid, initializing player');
        updateSpotifyStatus('SDK loaded, connecting player...', 'blue');
        
        spotifyPlayer = new Spotify.Player({
            name: 'openbeatster Web Player',
            getOAuthToken: cb => { 
                console.log('Player fordert OAuth Token an');
                cb(spotifyAccessToken); 
            },
            volume: 0.8
        });

        spotifyPlayer.addListener('ready', ({ device_id }) => {
            spotifyDeviceId = device_id;
            console.log('Spotify Player is ready with Device ID:', device_id);
            updateSpotifyStatus('READY! QR codes can be scanned', 'green');
        });
        
        spotifyPlayer.addListener('not_ready', ({ device_id }) => {
            console.log('Device ID has gone offline:', device_id);
            spotifyDeviceId = null;
            updateSpotifyStatus('Player not ready', 'red');
        });
        
        spotifyPlayer.addListener('initialization_error', ({ message }) => {
            console.error('Spotify Player initialization error:', message);
            updateSpotifyStatus('Initialization error', 'red');
        });
        
        spotifyPlayer.addListener('authentication_error', ({ message }) => {
            console.error('Spotify Player authentication error:', message);
            updateSpotifyStatus('ERROR: Login required', 'red');
            
            // Delete invalid token and restart OAuth
            localStorage.removeItem('spotifyAccessToken');
            spotifyAccessToken = null;
            
            // Wait briefly and then restart OAuth
            setTimeout(() => {
                console.log('Restarting OAuth flow due to authentication error...');
                redirectToSpotifyAuth();
            }, 2000);
        });
        
        spotifyPlayer.addListener('account_error', ({ message }) => {
            console.error('Spotify Player account error:', message);
            updateSpotifyStatus('Account error', 'red');
        });
        
        spotifyPlayer.addListener('playback_error', ({ message }) => {
            console.error('Spotify Player playback error:', message);
            updateSpotifyStatus('Playback error', 'red');
        });
        
        console.log('Connecting Spotify Player...');
        updateSpotifyStatus('Connecting player...', 'blue');
        spotifyPlayer.connect().then(success => {
            if (success) {
                console.log('Spotify Player successfully connected');
                updateSpotifyStatus('Player connected, waiting for readiness...', 'blue');
            } else {
                console.error('Spotify Player connection failed');
                updateSpotifyStatus('ERROR: Connection failed', 'red');
            }
        });
    };
    
    // Check if SDK is already loaded
    if (window.Spotify && window.Spotify.Player) {
        console.log('Spotify SDK already loaded, initializing directly...');
        initPlayer();
    } else {
        // Wait for SDK readiness
        console.log('Waiting for Spotify SDK...');
        window.addEventListener('SpotifySDKReady', initPlayer);
    }
}

// Global Spotify SDK callback - must be defined before SDK loading
window.onSpotifyWebPlaybackSDKReady = () => {
    console.log('Spotify Web Playback SDK ready (global callback)');
    // Trigger custom event for player initialization
    window.dispatchEvent(new CustomEvent('SpotifySDKReady'));
};

// Status Update Functions
function updateSpotifyStatus(status, color = '#333') {
    const statusText = document.getElementById('status-text');
    if (statusText) {
        statusText.textContent = status;
        statusText.style.color = color;
        
        // Add loading animation for certain states
        if (status.includes('Loading') || status.includes('Starting') || status.includes('Connecting')) {
            statusText.classList.add('loading');
        } else {
            statusText.classList.remove('loading');
        }
    }
    console.log('Spotify Status:', status);
}

if (spotifyAccessToken) {
    // Initialize the Spotify Web Player
    if (window.Spotify) {
        initializeSpotifyPlayer(spotifyAccessToken);
    } else {
        // If SDK not loaded yet, wait for it
        window.addEventListener('SpotifySDKReady', () => {
            initializeSpotifyPlayer(spotifyAccessToken);
        });
    }
}

// Play track after QR code scan
function playSpotifyTrack(trackId) {
    console.log('Attempting to play track:', trackId);
    console.log('Spotify Device ID:', spotifyDeviceId);
    console.log('Spotify Access Token available:', !!spotifyAccessToken);
    
    if (!spotifyDeviceId) {
        console.warn('Spotify Device ID not available. Trying to initialize player...');
        
        // Try to initialize player if not done yet
        if (spotifyAccessToken && window.Spotify) {
            initializeSpotifyPlayer(spotifyAccessToken);
        }
        
        // Wait briefly and try again
        setTimeout(() => {
            if (spotifyDeviceId) {
                console.log('Device ID now available, trying again...');
                playSpotifyTrackInternal(trackId);
            } else {
                console.error('Spotify Player not ready. Please wait a moment and try again.');
                alert('Spotify Player is still loading. Please wait a moment and scan the QR code again.');
            }
        }, 2000);
        return;
    }
    
    playSpotifyTrackInternal(trackId);
}

function playSpotifyTrackInternal(trackId) {
    fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${spotifyAccessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uris: [`spotify:track:${trackId}`] })
    }).then(res => {
        if (res.ok) {        console.log('Track is playing:', trackId);
        alert('Track is playing!');
        } else {
            return res.json().then(data => {
                console.error('Error playing track:', data);
                if (data.error && data.error.reason === 'PREMIUM_REQUIRED') {
                    alert('Spotify Premium required for playback!');
                } else if (data.error && data.error.reason === 'NO_ACTIVE_DEVICE') {
                    alert('No active Spotify device found. Please open Spotify on a device.');
                } else {
                    alert('Error playing track: ' + (data.error?.message || 'Unknown error'));
                }
            });
        }
    }).catch(err => {
        console.error('Network error playing track:', err);
        alert('Network error playing track.');
    });
}

// Token validation and refresh
async function validateAndRefreshToken() {
    if (!spotifyAccessToken) {
        console.log('No access token available');
        return false;
    }
    
    try {
        // Test the token with a simple API call
        const response = await fetch('https://api.spotify.com/v1/me', {
            headers: { Authorization: `Bearer ${spotifyAccessToken}` }
        });
        
        if (response.ok) {
            console.log('Access token is valid');
            return true;
        } else if (response.status === 401) {
            console.warn('Access token has expired, deleting it');
            localStorage.removeItem('spotifyAccessToken');
            spotifyAccessToken = null;
            updateSpotifyStatus('Token expired, login required...', 'orange');
            return false;
        } else {
            console.error('Unknown API error:', response.status);
            return false;
        }
    } catch (error) {
        console.error('Error validating token:', error);
        return false;
    }
}

// Logout function
function logout() {
    console.log('Logout - deleting stored tokens');
    localStorage.removeItem('spotifyAccessToken');
    localStorage.removeItem('spotify_code_verifier');
    spotifyAccessToken = null;
    spotifyDeviceId = null;
    
    if (spotifyPlayer) {
        spotifyPlayer.disconnect();
        spotifyPlayer = null;
    }
    
    updateSpotifyStatus('Logged out', 'gray');
}

// Debug function for manual token deletion
window.resetSpotifyAuth = logout;

// Debug function to show current configuration
window.showConfig = function() {
    console.log('=== Current Configuration ===');
    console.log('Spotify Client ID:', SPOTIFY_CLIENT_ID);
    console.log('Redirect URI:', REDIRECT_URI);
    console.log('Scopes:', SCOPES);
    console.log('Server Config:', window.CONFIG);
    console.log('============================');
    
    alert(`Configuration:
Client ID: ${SPOTIFY_CLIENT_ID.substring(0, 8)}...
Redirect URI: ${REDIRECT_URI}
Scopes: ${SCOPES.split(' ').length} permissions`);
};

// Configuration validation
function validateConfiguration() {
    if (!SPOTIFY_CLIENT_ID) {
        console.error('SPOTIFY_CLIENT_ID is not configured in config.js');
        updateSpotifyStatus('Configuration error: Missing Spotify Client ID', 'red');
        return false;
    }
    
    if (!REDIRECT_URI) {
        console.error('REDIRECT_URI is not configured in config.js');
        updateSpotifyStatus('Configuration error: Missing Redirect URI', 'red');
        return false;
    }
    
    console.log('Configuration loaded successfully');
    
    return true;
}

// Validate configuration on startup
if (!validateConfiguration()) {
    throw new Error('Invalid configuration. Please check config.js file.');
}
# openbeatster

A web application for scanning Spotify QR codes and playing tracks using the Spotify Web Playback SDK, inspired by popular music guessing games.

## Features

- **Local Network Hosting**: Can be hosted on any device in your local network (laptop, Raspberry Pi, etc.)
- **Mobile Control**: Use your smartphone to scan QR codes and control playback
- **Cross-Device**: Server runs on one device, control from any other device on the same network

## Setup

1. **Clone the repository**

2. **Create Spotify Developer App**
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Log in with your Spotify account
   - Click "Create App"
   - Fill in:
     - **App Name**: openbeatster Web App (or your preferred name)
     - **App Description**: QR code scanner for Spotify tracks
     - **Redirect URI**: `https://your-server-ip:5500` (replace with your actual IP)
   - Check "Web Playback SDK" in APIs used
   - Save the **Client ID** for the next step

3. **Configure the application**
   ```bash
   cp config.example.js config.js
   ```
   
   Edit `config.js` and add your:
   - Spotify Client ID (from step 2)
   - Server IP address and port
   - Redirect URI (must **exactly** match your Spotify app settings)

3. **Start the HTTPS server**
   ```bash
   python start_https_server.py
   ```

4. **Access the app**
   Open `https://your-server-ip:5500` in your browser
   Accept the self-signed certificate warning when prompted


## Requirements
- Spotify Premium account
- Python 3 (tested with Python 3.12)
- OpenSSL (for certificate generation)
- Local network access (for mobile device control)


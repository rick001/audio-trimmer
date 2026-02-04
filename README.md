# Audio Silence Remover

A Node.js web application that automatically detects and removes silent sections from audio files.

## Features

- 🎵 Upload audio files (MP3, WAV, M4A, OGG, FLAC, AAC, etc.)
- 🔇 Automatically detects silence (no sound or speech)
- ✂️ Removes silent sections from audio
- 📥 Download the processed audio file
- 🎨 Modern, user-friendly web interface

## Prerequisites

- **Node.js** (v14 or higher)
- **FFmpeg** must be installed on your system

### Installing FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

**Windows:**
Download from [FFmpeg official website](https://ffmpeg.org/download.html) and add to PATH.

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

## Usage

1. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

3. Upload an audio file using the web interface

4. Click "Remove Silence" to process the audio

5. Download the processed audio file

## How It Works

The application uses FFmpeg's `silenceremove` filter to detect and remove silent sections:
- Detects silence below -30dB threshold
- Removes silence periods longer than 0.5 seconds
- Preserves the original audio quality and format

## API Endpoints

- `POST /api/trim-silence` - Upload and process audio file
- `GET /api/download/:filename` - Download processed audio file
- `GET /api/health` - Health check endpoint

## Configuration

You can adjust silence detection parameters in `server.js`:
- `noise=-30dB` - Silence threshold (lower = more sensitive)
- `duration=0.5` - Minimum silence duration to remove (in seconds)

## File Size Limits

Default upload limit is 100MB. You can adjust this in `server.js`:
```javascript
limits: { fileSize: 100 * 1024 * 1024 } // Change 100 to your desired MB
```

## License

MIT

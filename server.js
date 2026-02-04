const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs-extra');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'output');

fs.ensureDirSync(uploadsDir);
fs.ensureDirSync(outputDir);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave',
      'audio/x-wav', 'audio/mp4', 'audio/m4a', 'audio/ogg',
      'audio/webm', 'audio/flac', 'audio/aac'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  }
});

// Function to detect silence and get silence periods
function detectSilence(audioPath) {
  return new Promise((resolve, reject) => {
    const silencePeriods = [];
    let currentSilence = null;

    ffmpeg(audioPath)
      .audioFilters('silencedetect=noise=-30dB:duration=0.5')
      .format('null')
      .on('stderr', (stderrLine) => {
        // Parse ffmpeg output for silence detection
        const silenceStartMatch = stderrLine.match(/silence_start: ([\d.]+)/);
        const silenceEndMatch = stderrLine.match(/silence_end: ([\d.]+)/);

        if (silenceStartMatch) {
          currentSilence = { start: parseFloat(silenceStartMatch[1]) };
        }

        if (silenceEndMatch && currentSilence) {
          currentSilence.end = parseFloat(silenceEndMatch[1]);
          silencePeriods.push(currentSilence);
          currentSilence = null;
        }
      })
      .on('end', () => {
        resolve(silencePeriods);
      })
      .on('error', (err) => {
        reject(err);
      })
      .save('/dev/null'); // Output to null since we only need the detection
  });
}

// Function to remove silence from audio
async function removeSilence(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    // Use ffmpeg's silenceremove filter to automatically remove silence
    // This is more efficient than manually cutting segments
    const outputExt = path.extname(outputPath).toLowerCase();
    const command = ffmpeg(inputPath)
      .audioFilters([
        'silenceremove=stop_periods=-1:stop_duration=0.5:stop_threshold=-30dB'
      ]);

    // Set appropriate audio codec based on output format
    // Audio filters require re-encoding, so we can't use codec copy
    if (outputExt === '.mp3' || outputExt === '.mpeg') {
      command.audioCodec('libmp3lame').audioBitrate(192);
    } else if (outputExt === '.m4a' || outputExt === '.mp4') {
      command.audioCodec('aac').audioBitrate(192);
    } else if (outputExt === '.ogg') {
      command.audioCodec('libvorbis');
    } else if (outputExt === '.wav') {
      command.audioCodec('pcm_s16le');
    } else {
      // Default to aac for other formats
      command.audioCodec('aac').audioBitrate(192);
    }

    command
      .on('start', (commandLine) => {
        console.log('FFmpeg command: ' + commandLine);
      })
      .on('progress', (progress) => {
        console.log('Processing: ' + Math.round(progress.percent) + '% done');
      })
      .on('end', () => {
        console.log('Audio processing finished');
        resolve();
      })
      .on('error', (err) => {
        console.error('Error processing audio:', err);
        reject(err);
      })
      .save(outputPath);
  });
}

// Upload and process endpoint
app.post('/api/trim-silence', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded' });
  }

  const inputPath = req.file.path;
  const outputFilename = `trimmed-${Date.now()}${path.extname(req.file.originalname)}`;
  const outputPath = path.join(outputDir, outputFilename);

  try {
    console.log(`Processing audio file: ${req.file.originalname}`);
    
    // Remove silence from audio
    await removeSilence(inputPath, outputPath);

    // Check if output file was created
    if (!fs.existsSync(outputPath)) {
      throw new Error('Output file was not created');
    }

    // Get file stats
    const stats = fs.statSync(outputPath);
    const originalSize = fs.statSync(inputPath).size;
    const newSize = stats.size;
    const reduction = ((originalSize - newSize) / originalSize * 100).toFixed(2);

    // Send the processed file
    res.json({
      success: true,
      message: 'Audio processed successfully',
      filename: outputFilename,
      downloadUrl: `/api/download/${outputFilename}`,
      originalSize: originalSize,
      newSize: newSize,
      sizeReduction: `${reduction}%`
    });

    // Clean up input file after processing
    setTimeout(() => {
      fs.unlinkSync(inputPath);
    }, 5000); // Keep for 5 seconds in case of issues

  } catch (error) {
    console.error('Error processing audio:', error);
    
    // Clean up on error
    if (fs.existsSync(inputPath)) {
      fs.unlinkSync(inputPath);
    }
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    res.status(500).json({
      error: 'Failed to process audio',
      message: error.message
    });
  }
});

// Download endpoint
app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(outputDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(filePath, (err) => {
    if (err) {
      console.error('Error downloading file:', err);
      res.status(500).json({ error: 'Failed to download file' });
    } else {
      // Clean up file after download
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }, 1000);
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Audio trimmer service is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('Make sure ffmpeg is installed on your system');
});

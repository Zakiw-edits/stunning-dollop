// app.js (Main server file)
const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const AWS = require('aws-sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// AWS Configuration
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

// Routes
app.use('/api/upload', require('./routes/upload'));
app.use('/api/videos', require('./routes/videos'));

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// routes/upload.js
const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');
const Video = require('../models/Video');

const s3 = new AWS.S3();

// POST endpoint for video upload
router.post('/', (req, res) => {
    if (!req.files || !req.files.video) {
        return res.status(400).send('No video file uploaded.');
    }

    const video = req.files.video;
    const allowedTypes = ['video/mp4', 'video/mkv', 'video/avi'];
    if (!allowedTypes.includes(video.mimetype)) {
        return res.status(400).send('Invalid file type. Only MP4, MKV, and AVI are allowed.');
    }

    if (video.size > 50 * 1024 * 1024) { // 50MB limit
        return res.status(400).send('File size exceeds 50MB limit.');
    }

    const uploadParams = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${Date.now()}_${video.name}`,
        Body: video.data,
        ACL: 'public-read',
        ContentType: video.mimetype,
    };

    s3.upload(uploadParams, (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error uploading video to S3.');
        }

        const newVideo = new Video({
            name: video.name,
            url: data.Location
        });

        newVideo.save()
            .then(() => res.send({ message: 'Video uploaded successfully!', filePath: data.Location }))
            .catch(err => res.status(500).send('Failed to save video metadata.'));
    });
});

module.exports = router;

// routes/videos.js
const express = require('express');
const Video = require('../models/Video');
const router = express.Router();

// GET endpoint for fetching videos
router.get('/', async (req, res) => {
    try {
        const videos = await Video.find();
        res.json(videos);
    } catch (err) {
        res.status(500).send('Error fetching videos.');
    }
});

module.exports = router;

// models/Video.js
const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Video', videoSchema);

// Frontend Integration - script.js
function handleUpload() {
    const fileInput = document.getElementById('videoFile');
    const gallery = document.getElementById('videoGallery');

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('video', file);

        fetch(`${window.location.origin}/api/upload`, {
            method: 'POST',
            body: formData,
        })
            .then(response => response.json())
            .then(data => {
                if (data.filePath) {
                    displayVideo({ name: file.name, url: data.filePath });
                } else {
                    alert('Failed to upload video. Please check the file type and size.');
                }
            })
            .catch(err => {
                console.error(err);
                alert('An error occurred during the upload. Please try again.');
            });
    } else {
        alert('Please select a video file to upload.');
    }
}

async function loadVideos() {
    const response = await fetch(`${window.location.origin}/api/videos`);
    const videos = await response.json();
    const gallery = document.getElementById('videoGallery');
    gallery.innerHTML = '';

    videos.forEach(video => {
        const videoElement = document.createElement('div');
        videoElement.innerHTML = `
            <h3>${video.name}</h3>
            <video width="320" height="240" controls>
                <source src="${video.url}" type="video/mp4">
            </video>
        `;
        gallery.appendChild(videoElement);
    });
}

window.onload = loadVideos;

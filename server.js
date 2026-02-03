const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Enable CORS if accessed from other origins (mainly for dev)
app.use(cors());

// Determine upload directory (root of the project as requested)
const UPLOAD_DIR = __dirname;

// Configure Multer for file storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
        // Sanitize: remove special chars, spaces to underscores, lowercase
        // This ensures the URL is always valid and safe
        const name = file.originalname.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
        // Add timestamp to prevent caching issues or overwrites if desired, 
        // but for now just safely naming it is enough.
        cb(null, name);
    }
});

const upload = multer({ storage: storage });

// Serve static files (the flipbook app)
app.use(express.static(__dirname));

// Upload Endpoint
app.post('/upload', upload.single('pdfFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`File uploaded: ${req.file.filename}`);

    // Return the URL to access the uploaded file
    // Use relative path so it works across devices/IPs and doesn't hardcode localhost
    const fileUrl = `/${req.file.filename}`;

    res.json({
        success: true,
        filename: req.file.filename,
        url: fileUrl
    });
});

// List Files Endpoint
app.get('/files', (req, res) => {
    fs.readdir(UPLOAD_DIR, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to scan directory' });
        }

        // Filter for PDF files
        const pdfFiles = files
            .filter(file => path.extname(file).toLowerCase() === '.pdf')
            .map(file => ({
                name: file,
                url: `/${file}`,
                // We could add file size/date here if we used fs.stat, 
                // but keeping it simple for now.
                timestamp: Date.now()
            }));

        res.json(pdfFiles);
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT}/viewpdf2.html to view your app`);
});

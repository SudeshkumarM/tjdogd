import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

import zlib from 'zlib';

const __dirname = import.meta.dirname || path.resolve('.');

// Extract embedded JPEGs or images from single-page PDF files in leaders/ so <img> tags can render them
// Ensure embedded images are extracted from PDFs in leaders/
function ensurePdfImagesExtracted() {
  const leadersDir = path.join(__dirname, 'leaders');
  const pdfPath = path.join(leadersDir, '2.pdf');
  const jpgPath = path.join(leadersDir, '2.jpeg');
  const pngPath = path.join(leadersDir, '2.png');
  // If already extracted, nothing to do
  if (fs.existsSync(jpgPath) || fs.existsSync(pngPath)) return;
}
ensurePdfImagesExtracted();

// Create clean 1.jpeg, 2.jpeg, 3.jpeg, 4.jpeg copies for 2ndyear(b) WhatsApp photos
function normalize2ndYearB() {
  const dir = path.join(__dirname, '2ndyear(b)');
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jpeg') && f.startsWith('WhatsApp'));
    files.sort();
    files.forEach((f, idx) => {
      const target = path.join(dir, `${idx + 1}.jpeg`);
      if (!fs.existsSync(target)) {
        fs.copyFileSync(path.join(dir, f), target);
        console.log(`[Vite] Normalized ${f} -> ${idx + 1}.jpeg`);
      }
    });
  }
}
normalize2ndYearB();


function serveLocalMediaPlugin() {
  const mimeTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
  };

  const allowedFolders = [
    'introvideo',
    'faculty',
    'leaders',
    '2ndyear(a)',
    '2ndyear(b)',
    '2ndyear(c)',
    '2ndyear(d)',
    '3rdyear(a)',
    '3rdyear(b)',
    '4thyear',
  ];

  return {
    name: 'serve-local-media',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        // Never intercept Vite internal modules or JS import requests
        if (req.url?.includes('?import') || req.url?.includes('/@') || req.url?.includes('?t=')) {
          return next();
        }

        const decodedUrl = decodeURIComponent(req.url?.split('?')[0] || '');

        // Automatically resolve any video in /introvideo folder
        if (decodedUrl.startsWith('/introvideo')) {
          const introDir = path.join(__dirname, 'introvideo');
          if (fs.existsSync(introDir)) {
            let targetFile = '';
            const requestedFile = decodedUrl.replace(/^\/introvideo\/?/, '');
            const directPath = path.join(introDir, requestedFile);

            if (requestedFile && fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
              targetFile = directPath;
            } else {
              const files = fs.readdirSync(introDir);
              const videoFile = files.find((f) => /\.(mp4|webm|mov|mkv)$/i.test(f));
              if (videoFile) {
                targetFile = path.join(introDir, videoFile);
              }
            }

            if (targetFile && fs.existsSync(targetFile)) {
              const stat = fs.statSync(targetFile);
              const fileSize = stat.size;
              const range = req.headers.range;

              if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

                if (start >= fileSize || end >= fileSize) {
                  res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
                  return res.end();
                }

                const chunkSize = end - start + 1;
                const fileStream = fs.createReadStream(targetFile, { start, end });

                res.writeHead(206, {
                  'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                  'Accept-Ranges': 'bytes',
                  'Content-Length': chunkSize,
                  'Content-Type': 'video/mp4',
                });
                return fileStream.pipe(res);
              } else {
                res.writeHead(200, {
                  'Content-Length': fileSize,
                  'Content-Type': 'video/mp4',
                  'Accept-Ranges': 'bytes',
                });
                return fs.createReadStream(targetFile).pipe(res);
              }
            }
          }
        }

        // Handle other folders (faculty, leaders, 2ndyear, etc.)
        const matchedFolder = allowedFolders.find(
          (folder) => folder !== 'introvideo' && decodedUrl.startsWith(`/${folder}/`)
        );

        if (matchedFolder) {
          if (matchedFolder === 'leaders') {
            ensurePdfImagesExtracted();
          }
          if (matchedFolder === '2ndyear(b)') {
            normalize2ndYearB();
          }

          const relativePath = decodedUrl.slice(1);
          let filePath = path.join(__dirname, relativePath);

          if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            const parsed = path.parse(filePath);
            const candidates = [
              path.join(parsed.dir, parsed.name + '.jpeg'),
              path.join(parsed.dir, parsed.name + '.jpg'),
              path.join(parsed.dir, parsed.name + '.png'),
              path.join(parsed.dir, parsed.name + '.webp'),
            ];
            if (matchedFolder === 'faculty' && (parsed.name === '1' || parsed.name === '1(HOD)')) {
              candidates.unshift(path.join(parsed.dir, '1(HOD).jpeg'), path.join(parsed.dir, '1.jpeg'));
            }
            if (matchedFolder === 'leaders' && parsed.name === '2') {
              candidates.unshift(path.join(parsed.dir, '2.png'), path.join(parsed.dir, '2.jpeg'));
            }
            const found = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
            if (found) {
              filePath = found;
            }
          }

          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            let contentType = mimeTypes[ext] || 'application/octet-stream';
            // Auto-detect magic bytes for images to prevent MIME-sniffing rejections
            try {
              const headerBuf = Buffer.alloc(8);
              const fd = fs.openSync(filePath, 'r');
              fs.readSync(fd, headerBuf, 0, 8, 0);
              fs.closeSync(fd);
              if (headerBuf[0] === 0x89 && headerBuf[1] === 0x50 && headerBuf[2] === 0x4e && headerBuf[3] === 0x47) {
                contentType = 'image/png';
              } else if (headerBuf[0] === 0xff && headerBuf[1] === 0xd8 && headerBuf[2] === 0xff) {
                contentType = 'image/jpeg';
              } else if (headerBuf.subarray(0, 4).toString('ascii') === 'RIFF') {
                contentType = 'image/webp';
              }
            } catch (e) {}

            const stat = fs.statSync(filePath);
            const fileSize = stat.size;
            const range = req.headers.range;

            if (range) {
              const parts = range.replace(/bytes=/, '').split('-');
              const start = parseInt(parts[0], 10);
              const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

              if (start >= fileSize || end >= fileSize) {
                res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
                return res.end();
              }

              const chunkSize = end - start + 1;
              const fileStream = fs.createReadStream(filePath, { start, end });

              res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': contentType,
              });
              return fileStream.pipe(res);
            } else {
              res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
              });
              return fs.createReadStream(filePath).pipe(res);
            }
          }
        }
        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), serveLocalMediaPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      fs: {
        allow: ['.'],
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

